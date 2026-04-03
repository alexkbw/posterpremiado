import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarInitials, resolveAvatarSource } from "@/lib/avatar-presets";
import { cn } from "@/lib/utils";

type ParticipantAvatarProps = {
  avatarValue?: string | null;
  className?: string;
  name: string;
  seed?: string;
};

export default function ParticipantAvatar({
  avatarValue,
  className,
  name,
  seed,
}: ParticipantAvatarProps) {
  return (
    <Avatar className={cn("h-10 w-10 border border-border/60 bg-muted", className)}>
      <AvatarImage alt={name} src={resolveAvatarSource(avatarValue, seed ?? name)} />
      <AvatarFallback className="bg-muted font-medium text-foreground">
        {getAvatarInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
