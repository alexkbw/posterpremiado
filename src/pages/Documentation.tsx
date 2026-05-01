import { useEffect, useMemo, useState } from "react";
import { BookText, CircleAlert, FileText, Menu, ScrollText } from "lucide-react";
import { Link } from "react-router-dom";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { documentation } from "@/documentation-source";
import { cn } from "@/lib/utils";
import { getDocumentationSummary, groupDocumentationSections, type DocumentationBlock } from "@/lib/documentation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const groupedSections = groupDocumentationSections(documentation.sections);
const documentationSummary = getDocumentationSummary(documentation);
const metadataEntries = new Map(documentation.metadata.map((entry) => [entry.label.toLowerCase(), entry.value]));

function DocumentationSidebar({
  activeSectionId,
  className,
  onNavigate,
}: {
  activeSectionId: string;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <div
      className={cn(
        "glass-card rounded-[1.75rem] border border-white/10 bg-black/30 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.24)]",
        className,
      )}
    >
      <div className="mb-4 flex items-center gap-3 px-2">
        <div className="rounded-2xl border border-primary/20 bg-primary/10 p-2.5 text-primary">
          <ScrollText className="h-5 w-5" />
        </div>
        <div>
          <p className="font-display text-lg font-semibold text-white">Documentacao</p>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">PosterPremiado</p>
        </div>
      </div>

      <Separator className="mb-4 bg-white/10" />

      <ScrollArea className="h-[calc(100vh-9.75rem)] pr-3">
        <nav aria-label="Indice da documentacao" className="space-y-6 pr-2">
          {groupedSections.map((group) => (
            <div key={group.title} className="space-y-2">
              <p className="px-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary/75">{group.title}</p>
              <div className="space-y-1">
                {group.sections.map((section) => {
                  const isActive = activeSectionId === section.id;

                  return (
                    <a
                      key={section.id}
                      className={cn(
                        "block rounded-2xl px-3 py-2.5 text-sm leading-6 transition-colors",
                        isActive
                          ? "bg-primary/12 text-primary shadow-[inset_0_0_0_1px_rgba(245,198,68,0.16)]"
                          : "text-foreground/78 hover:bg-white/5 hover:text-white",
                      )}
                      href={`#${section.id}`}
                      onClick={() => {
                        onNavigate?.();
                      }}
                    >
                      {section.title}
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>
    </div>
  );
}

function renderBlock(block: DocumentationBlock, blockIndex: number) {
  switch (block.type) {
    case "subheading":
      return (
        <h3
          key={block.id}
          className="scroll-mt-28 pt-2 font-display text-xl font-semibold text-white sm:text-2xl"
          id={block.id}
        >
          {block.title}
        </h3>
      );
    case "paragraph":
      return (
        <p key={`paragraph-${blockIndex}`} className="max-w-3xl text-[15px] leading-7 text-foreground/82 sm:text-base">
          {block.text}
        </p>
      );
    case "list":
      return (
        <ul
          key={`list-${blockIndex}`}
          className="ml-5 list-disc space-y-2 text-[15px] leading-7 text-foreground/82 marker:text-primary sm:text-base"
        >
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "pending":
      return (
        <Alert
          key={`pending-${blockIndex}`}
          className="rounded-[1.5rem] border-amber-400/20 bg-amber-500/10 text-amber-50 [&>svg]:text-amber-200"
        >
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Conteudo em atualizacao</AlertTitle>
          <AlertDescription>
            <ul className="ml-4 list-disc space-y-2 marker:text-amber-200">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      );
    default:
      return null;
  }
}

export default function Documentation() {
  const [activeSectionId, setActiveSectionId] = useState(documentation.sections[0]?.id ?? "");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const objective = metadataEntries.get("objetivo");
  const status = metadataEntries.get("status");
  const version = metadataEntries.get("versao");
  const description = useMemo(() => documentationSummary, []);

  useEffect(() => {
    const previousTitle = document.title;
    const existingDescriptionTag = document.querySelector('meta[name="description"]');
    const previousDescription = existingDescriptionTag?.getAttribute("content") ?? null;
    let descriptionTag = existingDescriptionTag;
    let createdDescriptionTag = false;

    if (!descriptionTag) {
      descriptionTag = document.createElement("meta");
      descriptionTag.setAttribute("name", "description");
      document.head.appendChild(descriptionTag);
      createdDescriptionTag = true;
    }

    document.title = `${documentation.title} | PosterPremiado`;
    descriptionTag.setAttribute("content", description);

    return () => {
      document.title = previousTitle;

      if (!descriptionTag) {
        return;
      }

      if (previousDescription !== null) {
        descriptionTag.setAttribute("content", previousDescription);
        return;
      }

      if (createdDescriptionTag) {
        descriptionTag.remove();
      } else {
        descriptionTag.removeAttribute("content");
      }
    };
  }, [description]);

  useEffect(() => {
    const syncHashNavigation = () => {
      const hash = window.location.hash.replace(/^#/, "");

      if (!hash) {
        return;
      }

      const target = document.getElementById(hash);

      if (!target) {
        return;
      }

      setActiveSectionId(hash);
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    syncHashNavigation();
    window.addEventListener("hashchange", syncHashNavigation);

    return () => {
      window.removeEventListener("hashchange", syncHashNavigation);
    };
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const sectionElements = documentation.sections
      .map((section) => document.getElementById(section.id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (sectionElements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        if (visibleEntries[0]) {
          setActiveSectionId(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: "-18% 0px -65% 0px",
        threshold: [0.15, 0.3, 0.6],
      },
    );

    sectionElements.forEach((section) => observer.observe(section));

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(245,198,68,0.08),transparent_32%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_26%),linear-gradient(180deg,#111216_0%,#0b0c0f_100%)]">
      <Navbar />

      <main className="pt-20">
        <div className="container mx-auto px-4 pb-16">
          <section className="mb-6 overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03)_42%,rgba(255,255,255,0.01)_100%)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-8">
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link to="/">PosterPremiado</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>Documentacao</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>

                <Sheet onOpenChange={setMobileNavOpen} open={mobileNavOpen}>
                  <SheetTrigger asChild>
                    <Button className="lg:hidden" size="sm" variant="glass">
                      <Menu className="h-4 w-4" />
                      Indice
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="border-white/10 bg-[#101114] text-foreground sm:max-w-md" side="left">
                    <SheetHeader className="mb-4">
                      <SheetTitle className="font-display text-left">Indice da documentacao</SheetTitle>
                      <SheetDescription className="text-left">
                        Navegue pelas secoes principais da plataforma.
                      </SheetDescription>
                    </SheetHeader>

                    <DocumentationSidebar
                      activeSectionId={activeSectionId}
                      className="h-full border-white/10 bg-white/5"
                      onNavigate={() => setMobileNavOpen(false)}
                    />
                  </SheetContent>
                </Sheet>
              </div>

              <div className="max-w-4xl">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {status ? (
                    <Badge className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-primary" variant="outline">
                      Status: {status}
                    </Badge>
                  ) : null}
                  {version ? (
                    <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-foreground/78" variant="outline">
                      Versao {version}
                    </Badge>
                  ) : null}
                  <Badge className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-200" variant="outline">
                    {documentation.sections.length} secoes publicadas
                  </Badge>
                </div>

                <div className="mb-6 flex items-center gap-3">
                  <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary">
                    <BookText className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Central do usuario</p>
                    <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">{documentation.title}</h1>
                  </div>
                </div>

                <p className="max-w-3xl text-lg leading-8 text-foreground/82">{description}</p>

                {objective ? (
                  <div className="mt-6 max-w-3xl rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/75">Escopo atual</p>
                    <p className="mt-2 text-sm leading-7 text-foreground/76">{objective}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[300px,minmax(0,1fr)] xl:grid-cols-[320px,minmax(0,1fr)]">
            <aside className="hidden lg:block">
              <DocumentationSidebar activeSectionId={activeSectionId} className="sticky top-24" />
            </aside>

            <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] shadow-[0_24px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl">
              <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5 sm:px-8">
                <div className="rounded-2xl border border-primary/20 bg-primary/10 p-2.5 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-xl font-semibold text-white">Conteudo completo</p>
                  <p className="text-sm text-muted-foreground">Regras, funcionamento e pontos ainda em atualizacao.</p>
                </div>
              </div>

              <div className="px-6 py-2 sm:px-8">
                {documentation.sections.map((section, sectionIndex) => (
                  <section
                    className={cn(
                      "scroll-mt-28 py-8",
                      sectionIndex !== documentation.sections.length - 1 && "border-b border-white/10",
                    )}
                    id={section.id}
                    key={section.id}
                  >
                    <div className="space-y-5">
                      <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Secao {sectionIndex + 1}</p>
                        <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">{section.title}</h2>
                      </div>

                      <div className="space-y-4">{section.blocks.map((block, blockIndex) => renderBlock(block, blockIndex))}</div>
                    </div>
                  </section>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
