import { describe, expect, it } from "vitest";

import { getDocumentationSummary, groupDocumentationSections, parseDocumentation } from "./documentation";

const documentationFixture = `# Guia do Usuario

Status: Publicado
Versao: 1.2

## 1. Visao geral

Primeiro paragrafo de abertura.

### 1.1 Como funciona

- passo um
- passo dois

[A COMPLETAR] Texto juridico final
[A COMPLETAR] Politica detalhada

## 2. Fluxo

Outro paragrafo relevante.
`;

describe("documentation parser", () => {
  it("parses sections, subheadings, lists and pending items from markdown", () => {
    const documentation = parseDocumentation(documentationFixture);

    expect(documentation.title).toBe("Guia do Usuario");
    expect(documentation.metadata).toEqual([
      { label: "Status", value: "Publicado" },
      { label: "Versao", value: "1.2" },
    ]);
    expect(documentation.sections).toHaveLength(2);
    expect(documentation.sections[0].id).toBe("1-visao-geral");
    expect(documentation.sections[0].blocks).toEqual([
      { text: "Primeiro paragrafo de abertura.", type: "paragraph" },
      { id: "1-visao-geral-1-1-como-funciona", title: "1.1 Como funciona", type: "subheading" },
      { items: ["passo um", "passo dois"], type: "list" },
      { items: ["Texto juridico final", "Politica detalhada"], type: "pending" },
    ]);
  });

  it("builds the sidebar groups and derives a summary from the first paragraph", () => {
    const documentation = parseDocumentation(documentationFixture);
    const groups = groupDocumentationSections(documentation.sections);

    expect(getDocumentationSummary(documentation)).toBe("Primeiro paragrafo de abertura.");
    expect(groups).toEqual([
      {
        sections: documentation.sections,
        title: "Visao geral",
      },
    ]);
  });
});
