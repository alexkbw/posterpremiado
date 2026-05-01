export type DocumentationMetadata = {
  label: string;
  value: string;
};

export type DocumentationBlock =
  | {
      text: string;
      type: "paragraph";
    }
  | {
      items: string[];
      type: "list";
    }
  | {
      id: string;
      title: string;
      type: "subheading";
    }
  | {
      items: string[];
      type: "pending";
    };

export type DocumentationSection = {
  blocks: DocumentationBlock[];
  id: string;
  sectionNumber: number | null;
  title: string;
};

export type DocumentationDocument = {
  metadata: DocumentationMetadata[];
  sections: DocumentationSection[];
  title: string;
};

export type DocumentationNavGroup = {
  sectionNumbers: number[];
  title: string;
};

const NAV_GROUPS: DocumentationNavGroup[] = [
  { sectionNumbers: [1, 2], title: "Visao geral" },
  { sectionNumbers: [3, 4], title: "Conta e compra" },
  { sectionNumbers: [5, 6], title: "Sorteios e pagamentos" },
  { sectionNumbers: [7, 8], title: "Seguranca e dados" },
  { sectionNumbers: [9, 10, 11], title: "Comunidade e suporte" },
  { sectionNumbers: [12, 13, 14, 15], title: "Transparencia e notas" },
];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getUniqueSlug(value: string, counts: Map<string, number>) {
  const baseSlug = slugify(value) || "secao";
  const currentCount = counts.get(baseSlug) ?? 0;
  counts.set(baseSlug, currentCount + 1);

  return currentCount === 0 ? baseSlug : `${baseSlug}-${currentCount + 1}`;
}

function getSectionNumber(title: string) {
  const match = title.match(/^(\d+)\./);
  return match ? Number(match[1]) : null;
}

export function getDocumentationSummary(documentation: DocumentationDocument) {
  for (const section of documentation.sections) {
    const firstParagraph = section.blocks.find((block) => block.type === "paragraph");

    if (firstParagraph && firstParagraph.type === "paragraph") {
      return firstParagraph.text;
    }
  }

  return "Consulte regras, funcionamento e informacoes essenciais da plataforma PosterPremiado.";
}

export function groupDocumentationSections(sections: DocumentationSection[]) {
  const grouped = NAV_GROUPS.map((group) => ({
    sections: sections.filter((section) => group.sectionNumbers.includes(section.sectionNumber ?? -1)),
    title: group.title,
  })).filter((group) => group.sections.length > 0);

  const assignedIds = new Set(grouped.flatMap((group) => group.sections.map((section) => section.id)));
  const remainingSections = sections.filter((section) => !assignedIds.has(section.id));

  if (remainingSections.length > 0) {
    grouped.push({
      sections: remainingSections,
      title: "Outros topicos",
    });
  }

  return grouped;
}

export function parseDocumentation(source: string): DocumentationDocument {
  const normalizedSource = source.replace(/\r\n/g, "\n");
  const lines = normalizedSource.split("\n");
  const slugCounts = new Map<string, number>();
  const metadata: DocumentationMetadata[] = [];
  const sections: DocumentationSection[] = [];
  const introParagraphLines: string[] = [];

  let title = "Documentacao";
  let currentSection: DocumentationSection | null = null;
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let pendingItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    const text = paragraphLines.join(" ").trim();
    paragraphLines = [];

    if (!text) {
      return;
    }

    if (currentSection) {
      currentSection.blocks.push({ text, type: "paragraph" });
      return;
    }

    introParagraphLines.push(text);
  };

  const flushList = () => {
    if (!currentSection || listItems.length === 0) {
      listItems = [];
      return;
    }

    currentSection.blocks.push({ items: [...listItems], type: "list" });
    listItems = [];
  };

  const flushPending = () => {
    if (!currentSection || pendingItems.length === 0) {
      pendingItems = [];
      return;
    }

    currentSection.blocks.push({ items: [...pendingItems], type: "pending" });
    pendingItems = [];
  };

  const flushBlocks = () => {
    flushParagraph();
    flushList();
    flushPending();
  };

  const finalizeSection = () => {
    flushBlocks();

    if (!currentSection) {
      return;
    }

    sections.push(currentSection);
    currentSection = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushBlocks();
      continue;
    }

    if (trimmed.startsWith("# ")) {
      finalizeSection();
      title = trimmed.slice(2).trim();
      continue;
    }

    if (trimmed.startsWith("## ")) {
      finalizeSection();

      const sectionTitle = trimmed.slice(3).trim();
      currentSection = {
        blocks: [],
        id: getUniqueSlug(sectionTitle, slugCounts),
        sectionNumber: getSectionNumber(sectionTitle),
        title: sectionTitle,
      };
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushBlocks();

      if (!currentSection) {
        continue;
      }

      const subheadingTitle = trimmed.slice(4).trim();
      currentSection.blocks.push({
        id: `${currentSection.id}-${getUniqueSlug(subheadingTitle, slugCounts)}`,
        title: subheadingTitle,
        type: "subheading",
      });
      continue;
    }

    if (!currentSection) {
      const metadataMatch = trimmed.match(/^([^:]+):\s+(.+)$/);

      if (metadataMatch) {
        metadata.push({
          label: metadataMatch[1].trim(),
          value: metadataMatch[2].trim(),
        });
        continue;
      }
    }

    if (trimmed.startsWith("[A COMPLETAR]")) {
      flushParagraph();
      flushList();
      pendingItems.push(trimmed.replace(/^\[A COMPLETAR\]\s*/, "").trim());
      continue;
    }

    if (trimmed.startsWith("- ")) {
      flushParagraph();
      flushPending();
      listItems.push(trimmed.slice(2).trim());
      continue;
    }

    flushList();
    flushPending();
    paragraphLines.push(trimmed);
  }

  finalizeSection();

  if (introParagraphLines.length > 0) {
    metadata.push({
      label: "Resumo",
      value: introParagraphLines.join(" "),
    });
  }

  return {
    metadata,
    sections,
    title,
  };
}
