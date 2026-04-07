import cabeloEncaracoladoAvatar from "@/assets/avatar/cabelo_encaracolado_256.png";
import cabeloLongoAvatar from "@/assets/avatar/cabelo_longo_256.png";
import caraFelizAvatar from "@/assets/avatar/cara_feliz_256.png";
import carecaAvatar from "@/assets/avatar/careca_256.png";
import estilosoAvatar from "@/assets/avatar/estiloso_256.png";
import femPadraoAvatar from "@/assets/avatar/fem_padrao_256.png";
import garotoAvatar from "@/assets/avatar/garoto_256.png";
import homemFelizAvatar from "@/assets/avatar/homem_feliz_256.png";
import mascPadraoAvatar from "@/assets/avatar/masc_padrao_256.png";
import nervosoAvatar from "@/assets/avatar/nervoso_256.png";

export type AvatarPreset = {
  id: string;
  label: string;
  description: string;
  tag: string;
  src: string;
};

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: "female-1",
    label: "Clássico Claro",
    description: "Simples e neutro, sem distrações.",
    tag: "Neutro • Profissional",
    src: femPadraoAvatar,
  },
  {
    id: "female-2",
    label: "Cabelo Longo",
    description: "Visual moderno com presença leve e elegante.",
    tag: "Estilo • Casual",
    src: cabeloLongoAvatar,
  },
  {
    id: "female-3",
    label: "Encaracolado",
    description: "Cheio de personalidade e identidade marcante.",
    tag: "Estilo • Forte",
    src: cabeloEncaracoladoAvatar,
  },
  {
    id: "female-4",
    label: "Sorridente",
    description: "Transmite simpatia e acessibilidade.",
    tag: "Amigável",
    src: caraFelizAvatar,
  },
  {
    id: "male-1",
    label: "Clássico",
    description: "Padrão discreto para qualquer contexto.",
    tag: "Neutro",
    src: mascPadraoAvatar,
  },
  {
    id: "male-2",
    label: "Jovem",
    description: "Visual casual e moderno, mais informal.",
    tag: "Jovem • Casual",
    src: garotoAvatar,
  },
  {
    id: "male-3",
    label: "Feliz",
    description: "Energia positiva e descontraída.",
    tag: "Leve • Positivo",
    src: homemFelizAvatar,
  },
  {
    id: "male-4",
    label: "Careca",
    description: "Visual direto e objetivo, sem excessos.",
    tag: "Minimalista • Maduro",
    src: carecaAvatar,
  },
  {
    id: "avatar-9",
    label: "Estiloso",
    description: "Com atitude e confiança, chama atenção sem exagero.",
    tag: "Estilo • Confiante",
    src: estilosoAvatar,
  },
  {
    id: "avatar-10",
    label: "Expressivo",
    description: "Criativo e fora do padrão - mais divertido que sério.",
    tag: "Criativo • Divertido",
    src: nervosoAvatar,
  },
];

export function getAvatarPreset(id?: string | null) {
  return AVATAR_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function getDefaultAvatarPreset(_seed?: string) {
  return getAvatarPreset("male-1") ?? AVATAR_PRESETS[0];
}

export function getAvatarPresetSrc(id?: string | null) {
  return getAvatarPreset(id)?.src ?? null;
}

export function resolveAvatarSource(avatarValue?: string | null, seed = "participant") {
  const presetSrc = getAvatarPresetSrc(avatarValue);

  if (presetSrc) {
    return presetSrc;
  }

  if (avatarValue?.startsWith("http") || avatarValue?.startsWith("/") || avatarValue?.startsWith("data:")) {
    return avatarValue;
  }

  return getDefaultAvatarPreset(seed).src;
}

export function getAvatarInitials(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
