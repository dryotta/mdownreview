import { basename } from "@/lib/path-utils";

interface Props {
  path: string;
  size?: number;
}

export function BinaryPlaceholder({ path, size }: Props) {
  const name = basename(path);
  return (
    <div className="binary-placeholder">
      <p>This file cannot be displayed</p>
      <p className="binary-filename">{name}</p>
      {size !== undefined && (
        <p className="binary-size">{(size / 1024).toFixed(1)} KB</p>
      )}
    </div>
  );
}
