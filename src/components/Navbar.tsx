import { Link } from "react-router-dom";
import { LogIn, LogOut, MessageCircle, Trophy, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const { user, signOut } = useAuth();

  return (
    <nav className="glass-card fixed left-0 right-0 top-0 z-50 border-b border-border/50">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link className="flex items-center gap-2" to="/">
          <Trophy className="h-6 w-6 text-primary" />
          <span className="text-lg font-display font-bold text-gradient-gold">PosterPremiado</span>
        </Link>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link to="/dashboard">
                <Button size="sm" variant="ghost">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">Painel</span>
                </Button>
              </Link>
              <Link to="/chat">
                <Button size="sm" variant="ghost">
                  <MessageCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Chat</span>
                </Button>
              </Link>
              <Button onClick={signOut} size="sm" variant="ghost">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </>
          ) : (
            <Link to="/auth">
              <Button size="sm" variant="hero">
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
