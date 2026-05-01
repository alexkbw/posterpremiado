import { Link } from "react-router-dom";

import BrandMark from "@/components/BrandMark";

export default function Footer() {
  return (
    <footer className="border-t border-border/50 bg-secondary/10 py-8">
      <div className="container mx-auto px-4 text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <BrandMark className="h-5 w-5" />
          <span className="font-display font-bold text-gradient-gold">PosterPremiado</span>
        </div>
        <div className="mb-4 flex items-center justify-center gap-5 text-sm text-muted-foreground">
          <Link className="transition-colors hover:text-foreground" to="/documentacao">
            Documentacao
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          (c) {new Date().getFullYear()} PosterPremiado. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
