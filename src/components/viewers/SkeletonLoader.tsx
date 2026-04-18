import "@/styles/skeleton.css";

const WIDTHS = ["90%", "75%", "85%", "60%", "80%", "70%", "88%", "65%"];

export function SkeletonLoader() {
  return (
    <div className="skeleton-loader" role="progressbar" aria-label="Loading…">
      {WIDTHS.map((w, i) => (
        <div key={i} className="skeleton-line" style={{ width: w }} />
      ))}
    </div>
  );
}
