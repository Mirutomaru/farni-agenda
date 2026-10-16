// FARNÍ AGENDA - EDGE FUNCTION
// Certifikáty Generator - Generování skutečných PDF dokumentů (křestní/birovací listiny)
// FIX #10: Sdílená GCP utilita z shared/gcp-auth.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsPDF } from 'https://esm.sh/jspdf@2.5.1';
import { getGoogleAccessToken } from '../shared/gcp-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GCS_BUCKET_NAME = Deno.env.get('GCS_BUCKET_NAME') || 'farni-agenda-certificates';

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metoda není povolena' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { personId, type } = body; // type: 'krest' | 'birovan'

    if (!personId || !type) {
      return new Response(JSON.stringify({ error: 'Chybí personId nebo type' }), { status: 400 });
    }

    console.log(`📜 Generování ${type} certifikátu pro osobu ${personId}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Načtení dat podle typu
    let osoba: any;
    let data: any;

    if (type === 'krest') {
      const { data: krestData, error } = await supabase
        .from('krestni_zapis')
        .select(`*, farar_vedouci:farar_vedouci(id,krestni_jmeno,prijmeni)`)
        .eq('id', personId)
        .single();

      if (error || !krestData) throw new Error(`Záznam o křtu nebyl nalezen: ${error?.message}`);

      const { data: osobaData } = await supabase
        .from('osoby')
        .select('*')
        .eq('id', krestData.pokrteny_id)
        .single();

      if (!osobaData) throw new Error('Osoba nebyla nalezena');
      osoba = osobaData;
      data = { ...krestData, farar_vedouci: krestData.farar_vedouci || null };
    } else if (type === 'birovan') {
      const { data: birovaniData, error } = await supabase
        .from('birovani_zapis')
        .select(`*, biskup_ktery_podelil:biskup_ktery_podelil(id,krestni_jmeno,prijmeni)`)
        .eq('id', personId)
        .single();

      if (error || !birovaniData) throw new Error(`Záznam o birování nebyl nalezen: ${error?.message}`);

      const { data: osobaData } = await supabase
        .from('osoby')
        .select('*')
        .eq('id', birovaniData.birovan_id)
        .single();

      if (!osobaData) throw new Error('Osoba nebyla nalezena');
      osoba = osobaData;
      data = { ...birovaniData, biskup: birovaniData.biskup_ktery_podelil || null };
    } else {
      return new Response(JSON.stringify({ error: 'Neplatný typ certifikátu' }), { status: 400 });
    }

    // Generování skutečného PDF (#9 oprava)
    const pdfBuffer = generateCertificatePDF(data, osoba, type);

    // Nahrání na GCS
    const fileName = `${type}_${osoba.id}_${Date.now()}.pdf`;
    const fileUrl = await uploadToGCS(fileName, pdfBuffer);

    // Aktualizace záznamu s URL certifikátu
    if (type === 'krest') {
      await supabase.from('krestni_zapis').update({ krestni_listina_url: fileUrl }).eq('id', personId);
    } else {
      await supabase.from('birovani_zapis').update({ birovani_listina_url: fileUrl }).eq('id', personId);
    }

    // Audit log
    await supabase.from('logs').insert([{
      user_id: 'system',
      akce: 'CERTIFICATE_GENERATED',
      tabulka: type === 'krest' ? 'krestni_zapis' : 'birovani_zapis',
      objekt_id: personId,
      data_po: { url: fileUrl },
    }]);

    return new Response(
      JSON.stringify({ success: true, url: fileUrl, fileName, type }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Chyba při generování certifikátu:', error instanceof Error ? error.message : 'Neznámá chyba');
    return new Response(
      JSON.stringify({ error: 'Generování selhalo', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// Generuje skutečné PDF pomocí jsPDF (#9 oprava)
function generateCertificatePDF(data: any, osoba: any, type: string): Uint8Array {
  const isKrest = type === 'krest';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = 210;
  const margin = 35;
  const contentWidth = pageWidth - 2 * margin;
  let y = 25;

  // Hlavička s dekorativní linkou
  doc.setDrawColor(80, 40, 20);
  doc.setLineWidth(1.5);
  doc.line(margin, 30, pageWidth - margin, 30);

  // Nadpis církve
  doc.setFont('times', 'normal');
  doc.setFontSize(18);
  doc.setTextColor(60, 30, 10);
  doc.text('Starokatolická církev v České republice', pageWidth / 2, 40, { align: 'center' });

  doc.setFontSize(14);
  doc.text(`Farnost ${osoba.farnost_id ? '(dle záznamu)' : ''}`, pageWidth / 2, 48, { align: 'center' });

  // Podtržení
  y = 58;
  doc.setLineWidth(0.8);
  doc.line(margin + 20, y, pageWidth - margin - 20, y);
  y += 12;

  // Typ certifikátu
  doc.setFontSize(22);
  doc.setFont('times', 'bold');
  doc.text(isKrest ? 'KŘESTNÍ LISTINA' : 'BIROVACÍ LISTINA', pageWidth / 2, y, { align: 'center' });
  y += 18;

  // Hlavní text
  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(40);
  doc.text('touto listinou potvrzuje:', pageWidth / 2, y, { align: 'center' });
  y += 12;

  // Jméno pokřtěného/birovaného
  doc.setFontSize(20);
  doc.setFont('times', 'bold');
  doc.setTextColor(80, 40, 20);
  doc.text(`${osoba.krestni_jmeno} ${osoba.prijmeni}`, pageWidth / 2, y, { align: 'center' });
  y += 12;

  // Datum narození
  doc.setFontSize(13);
  doc.setFont('times', 'normal');
  doc.setTextColor(40);
  const narodilSe = formatDate(osoba.datum_narozeni);
  doc.text(`narozen/a dne ${narodilSe}`, pageWidth / 2, y, { align: 'center' });
  y += 14;

  // Detail svátosti
  if (isKrest) {
    doc.text('byl/a pokřtěn/a:', pageWidth / 2, y, { align: 'center' });
    y += 10;

    doc.setFont('times', 'normal');
    doc.setFontSize(12);
    const detailY = y;

    doc.text(`Datum křtu:`, margin + 5, detailY);
    doc.text(formatDate(data.datum_krstu), pageWidth - margin - 5, detailY, { align: 'right' });

    doc.text(`Místo křtu:`, margin + 5, detailY + 8);
    doc.text(data.misto_krstu || '-', pageWidth - margin - 5, detailY + 8, { align: 'right' });

    if (data.farar_vedouci?.prijmeni) {
      doc.text(`Vedoucí farář:`, margin + 5, detailY + 16);
      doc.text(`${data.farar_vedouci.krestni_jmeno} ${data.farar_vedouci.prijmeni}`, pageWidth - margin - 5, detailY + 16, { align: 'right' });
    }

    // Kmotři
    const kmotriText = [
      data.kmotr_id ? `Kmotr` : null,
      data.kmotra_id ? `Kmotra` : null,
    ].filter(Boolean).join(', ');

    if (data.kmotr_id || data.kmotra_id) {
      y = detailY + 28;
      doc.text(`Kmotři:`, margin + 5, y);
    }
  } else {
    doc.text('byl/a birován/a:', pageWidth / 2, y, { align: 'center' });
    y += 10;

    const detailY = y;
    doc.text(`Datum birování:`, margin + 5, detailY);
    doc.text(formatDate(data.datum_birovani), pageWidth - margin - 5, detailY, { align: 'right' });

    doc.text(`Místo birování:`, margin + 5, detailY + 8);
    doc.text(data.misto_birovani || '-', pageWidth - margin - 5, detailY + 8, { align: 'right' });

    if (data.biskup?.prijmeni) {
      doc.text(`Biskup:`, margin + 5, detailY + 16);
      doc.text(`${data.biskup.krestni_jmeno} ${data.biskup.prijmeni}`, pageWidth - margin - 5, detailY + 16, { align: 'right' });
    }
  }

  // Patička s datem vydání a razítkem
  y = 240;
  doc.setDrawColor(80, 40, 20);
  doc.setLineWidth(1.5);
  doc.line(margin, y, pageWidth - margin, y);

  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text(`Vydáno dne: ${new Date().toLocaleDateString('cs-CZ')}`, pageWidth / 2, y + 12, { align: 'center' });

  y += 22;
  doc.setFontSize(12);
  doc.text('Ražba farnosti', pageWidth - margin, y, { align: 'right' });

  // Vrácení PDF jako Uint8Array pro GCS upload
  return doc.output('array') as unknown as Uint8Array;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Upload na GCS - používá sdílenou utilitu (#10 oprava)
async function uploadToGCS(fileName: string, content: Uint8Array): Promise<string> {
  console.log(`Nahrávání na GCS: ${fileName}`);
  const gcpKey = JSON.parse(Deno.env.get('GCP_SERVICE_ACCOUNT_KEY') || '{}');
  const token = await getGoogleAccessToken(JSON.stringify(gcpKey));
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET_NAME}/o?uploadType=media&name=${encodeURIComponent(fileName)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/pdf',
      'X-Goog-Upload-Protocol': 'raw',
    },
    body: content as unknown as Blob,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GCS upload failed (${response.status}): ${errText}`);
  }

  return `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${fileName}`;
}
