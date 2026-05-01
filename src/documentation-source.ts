import documentationMarkdown from "../docs/READMEDOCUMENTACAOUSUARIO.md?raw";

import { parseDocumentation } from "@/lib/documentation";

export const documentationSource = documentationMarkdown;
export const documentation = parseDocumentation(documentationMarkdown);
