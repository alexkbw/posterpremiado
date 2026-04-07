import { Trophy } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-border/50 bg-secondary/10 py-8">
      <div className="container mx-auto px-4 text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <span className="font-display font-bold text-gradient-gold">PosterPremiado</span>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} PosterPremiado. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
