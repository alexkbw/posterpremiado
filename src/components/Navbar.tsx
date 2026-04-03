import { Link } from "react-router-dom";
import { Trophy, LogIn, LogOut, User, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const { user, signOut } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-border/50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          <span className="text-lg font-display font-bold text-gradient-gold">PremioSemanal</span>
        </Link>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link to="/dashboard">
                <Button variant="ghost" size="sm">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">Painel</span>
                </Button>
              </Link>
              <Link to="/chat">
                <Button variant="ghost" size="sm">
                  <MessageCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Chat</span>
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </>
          ) : (
            <Link to="/auth">
              <Button variant="hero" size="sm">
                <LogIn className="h-4 w-4" />
                Entrar
              </Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
