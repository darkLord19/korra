import JSZip from "jszip";

export function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((raw) => {
    const clean = raw.replace(/[\\/]+/g, "_") || "file";
    let name = clean;
    let n = 2;
    while (seen.has(name.toLowerCase())) {
      const dot = clean.lastIndexOf(".");
      name = dot > 0 ? `${clean.slice(0, dot)}-${n}${clean.slice(dot)}` : `${clean}-${n}`;
      n++;
    }
    seen.add(name.toLowerCase());
    return name;
  });
}

export async function renderZip(docs: { name: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
  const sorted = [...docs].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const names = dedupeNames(sorted.map((d) => d.name));
  const zip = new JSZip();
  sorted.forEach((d, i) => {
    zip.file(names[i]!, d.bytes, { date: new Date(0), createFolders: false });
  });
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
