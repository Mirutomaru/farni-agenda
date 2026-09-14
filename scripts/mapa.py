import os
import ast
from pathlib import Path

# Nastavení generátoru
IGNORED_DIRS = {'.git', '.idea', 'pycache', 'venv', 'env', 'node_modules', 'build', '.gradle'}
ALLOWED_EXTENSIONS = {'.py', '.kt', '.ts', '.tsx'}
OUTPUT_FILE = 'projektova_mapa.txt'

def get_python_signature(node):
    """Získá přesnou definici funkce včetně argumentů a návratových typů (vyžaduje Python 3.9+)."""
    try:
        args = ast.unparse(node.args)
        returns = f" -> {ast.unparse(node.returns)}" if node.returns else ""
        prefix = "async def" if isinstance(node, ast.AsyncFunctionDef) else "def"
        return f"{prefix} {node.name}({args}){returns}:"
    except Exception:
        return f"def {node.name}(...):"

def parse_python_file(file_path):
    """Projde Python soubor přes abstraktní syntaktický strom (AST) bez jeho spuštění."""
    with open(file_path, 'r', encoding='utf-8') as f:
        try:
            source = f.read()
            tree = ast.parse(source)
        except Exception:
            return "        [Chyba analýzy syntaxe]\n"

    output = []
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            output.append(f"        class {node.name}:")
            docstring = ast.get_docstring(node)
            if docstring:
                # Přidá pouze první řádek docstringu pro stručnost
                output.append(f"            \"\"\"{docstring.split(chr(10))[0]}\"\"\"")
            
            for sub_node in node.body:
                if isinstance(sub_node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    sig = get_python_signature(sub_node)
                    output.append(f"            {sig}")
                    
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            sig = get_python_signature(node)
            output.append(f"        {sig}")
            docstring = ast.get_docstring(node)
            if docstring:
                output.append(f"            \"\"\"{docstring.split(chr(10))[0]}\"\"\"")
                
    return "\n".join(output) + "\n" if output else ""

def parse_kotlin_file(file_path):
    """Základní textová extrakce rozhraní pro Kotlin (Jetpack Compose/Android)."""
    output = []
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            stripped = line.strip()
            # Zachytí třídy, data classy, interfacy a funkce
            if any(stripped.startswith(k) for k in ["class ", "data class ", "interface ", "enum class "]):
                output.append(f"        {stripped.split('{')[0].strip()}")
            elif any(stripped.startswith(k) for k in ["fun ", "suspend fun ", "@Composable"]):
                if "@Composable" in stripped and "fun " not in stripped:
                    output.append(f"        @Composable") # Zachová anotaci
                else:
                    output.append(f"            {stripped.split('{')[0].strip()}")
    return "\n".join(output) + "\n" if output else ""

def parse_typescript_file(file_path):
    """Extrahuje třídy, funkce, interface a typy z TypeScript souborů."""
    import re
    
    output = []
    class_indent = '        '
    func_indent = '            '
    
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Exports a importy ignorujeme (jen struktura)
        if line.startswith('import ') or line.startswith('export '):
            pass
        
        # Třídy: export class / class / interface / type
        elif re.match(r'(export\s+)?(class|interface|type)\s+\w+', line):
            output.append(f"{class_indent}{line.split('{')[0].strip()}")
        
        # Funkce: function, async function, const name = ... => 
        elif re.match(r'(export\s+)?(async\s+)?function\s+\w+', line):
            sig = line.split('{')[0].strip()
            output.append(f"{func_indent}{sig}")
            
        # Arrow functions: const/let/var name = async (...) => nebo const/let/var name = (...) =>
        elif re.match(r'(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(', line):
            sig = line.split('=>')[0].strip().rstrip('(').rstrip(',')
            output.append(f"{func_indent}{sig} =>")
            
        # Metody ve třídách: methodName(params) { nebo async methodName()
        elif re.match(r'\s+(async\s+)?\w+\s*\(', line):
            sig = line.strip().split('{')[0].strip()
            if not sig.startswith('//') and not sig.startswith('*'):
                output.append(f"{func_indent}{sig}")
                
        i += 1
    
    return "\n".join(output) + "\n" if output else ""

def generate_map(root_dir):
    map_content = ["MAPA PROJEKTU APLIKACE\n" + "="*50 + "\n"]

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Modifikace dirnames in-place zajistí, že os.walk do těchto složek vůbec nevejde
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS]

        level = dirpath.replace(root_dir, '').count(os.sep)
        indent = ' ' * 4 * level
        folder_name = os.path.basename(dirpath)
        
        if folder_name:
            map_content.append(f"{indent}📂 {folder_name}/")

        sub_indent = ' ' * 4 * (level + 1)
        # Seřadíme soubory abecedně
        for f in sorted(filenames):
            ext = os.path.splitext(f)[1]
            if ext in ALLOWED_EXTENSIONS:
                file_path = os.path.join(dirpath, f)
                map_content.append(f"{sub_indent}📄 {f}")
                extracted = ""
                if ext == '.py':
                    extracted = parse_python_file(file_path)
                elif ext == '.kt':
                    extracted = parse_kotlin_file(file_path)
                elif ext in {'.ts', '.tsx'}:
                    extracted = parse_typescript_file(file_path)
                    
                if extracted.strip():
                    map_content.append(extracted)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out:
        out.write("\n".join(map_content))
    print(f"✅ Mapa projektu uložena do: {OUTPUT_FILE}")

if __name__ == "__main__":
    generate_map(os.getcwd())
