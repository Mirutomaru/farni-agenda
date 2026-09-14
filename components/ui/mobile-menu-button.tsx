// FARNÍ AGENDA - MOBILE MENU BUTTON (Client Component)
'use client';

import { useState } from 'react';

export default function MobileMenuButton() {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      <button 
        className="md:hidden p-2 rounded-md text-gray-600 hover:text-blue-600 hover:bg-blue-50" 
        onClick={() => setIsOpen(!isOpen)}
      >
        ☰
      </button>
      {isOpen && (
        <div id="mobile-menu" className="md:hidden hidden pb-4 border-t border-gray-100 mt-2 pt-3">
          {/* Will be filled by parent */}
        </div>
      )}
    </>
  );
}
