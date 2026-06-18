export default function SkeletonCard() {
  return (
    <div
      className="skeleton"
      style={{ aspectRatio: '4/5', width: '100%', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
      aria-hidden="true"
    />
  );
}
