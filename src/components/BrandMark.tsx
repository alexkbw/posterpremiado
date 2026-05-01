type BrandMarkProps = {
  className?: string;
};

export default function BrandMark({ className = "h-6 w-6" }: BrandMarkProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      src="/moeda.ico"
    />
  );
}
