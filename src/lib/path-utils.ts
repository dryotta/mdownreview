export function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

export function extname(path: string): string {
  const base = basename(path);
  const dotIdx = base.lastIndexOf(".");
  return dotIdx > 0 ? base.slice(dotIdx).toLowerCase() : "";
}
