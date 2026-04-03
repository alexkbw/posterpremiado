import { Trophy } from "lucide-react";

export default function Footer() {
  return (
    <footer className="py-8 border-t border-border/50 bg-secondary/10">
      <div className="container mx-auto px-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Trophy className="h-5 w-5 text-primary" />
          <span className="font-display font-bold text-gradient-gold">PremioSemanal</span>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} PremioSemanal. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
