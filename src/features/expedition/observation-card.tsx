"use client";

/**
 * One observation in the expedition feed. Photo thumbnails are read back from
 * IndexedDB blob storage; audio and notes render as glyphs. Nothing here
 * guesses at AI content — analysis appears only when it exists, and its origin
 * (on-device vs server) is always labeled.
 */
import * as React from "react";
import {
  AlertTriangle,
  BookOpen,
  Cpu,
  Globe,
  Mic,
  Search,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { mediaRepository } from "@/lib/db/repositories";
import { CATEGORY_META } from "@/lib/domain/labels";
import { observationQuery, retrieveKnowledge, type KnowledgeHit } from "@/lib/knowledge/retrieve";
import { usePreferences } from "@/lib/state/app-store";
import { useObservationAnalyzing } from "@/lib/state/expedition-store";
import { relativeTime } from "@/lib/utils";
import type { AIAnalysis, Observation } from "@/lib/domain/types";

function ConfidenceChip({ analysis }: { analysis: AIAnalysis }) {
  if (analysis.status === "unavailable" || analysis.confidenceLabel === "unknown") return null;
  const variant =
    analysis.confidenceLabel === "high"
      ? "success"
      : analysis.confidenceLabel === "medium"
        ? "sky"
        : "warning";
  return (
    <Badge variant={variant} className="text-[10px]">
      {analysis.confidenceLabel === "high"
        ? "High confidence"
        : analysis.confidenceLabel === "medium"
          ? "Medium confidence"
          : "Low confidence"}
    </Badge>
  );
}

function EngineChip({ analysis }: { analysis: AIAnalysis }) {
  if (analysis.status === "unavailable") return null;
  if (analysis.runtime === "on-device") {
    return (
      <Badge variant="muted" className="gap-1 text-[10px]">
        <Cpu className="h-3 w-3" aria-hidden />
        On-device
      </Badge>
    );
  }
  if (analysis.runtime === "server") {
    return (
      <Badge variant="muted" className="gap-1 text-[10px]">
        <Globe className="h-3 w-3" aria-hidden />
        Server AI
      </Badge>
    );
  }
  return null;
}

function AnalysisBlock({
  analysis,
  observationCategory,
}: {
  analysis: AIAnalysis;
  observationCategory: Observation["category"];
}) {
  const guessedCategory = analysis.category !== "unknown" ? CATEGORY_META[analysis.category] : null;
  const categoryDiffers =
    analysis.status !== "unavailable" &&
    analysis.category !== "unknown" &&
    analysis.category !== observationCategory;

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {analysis.status === "ok" && analysis.commonName ? (
          <span className="text-xs font-medium">
            {analysis.commonName}
            {analysis.scientificName ? (
              <span className="font-normal italic text-muted-foreground">
                {" "}
                · {analysis.scientificName}
              </span>
            ) : null}
          </span>
        ) : analysis.status === "unavailable" ? (
          <span className="text-xs font-medium text-muted-foreground">Analysis unavailable</span>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">
            Not identified with confidence
          </span>
        )}
        <ConfidenceChip analysis={analysis} />
        <EngineChip analysis={analysis} />
        {categoryDiffers && guessedCategory ? (
          <Badge variant="outline" className="text-[10px]">
            <span aria-hidden>{guessedCategory.emoji}</span> Looks like{" "}
            {guessedCategory.label.toLowerCase()}
          </Badge>
        ) : null}
      </div>

      {analysis.status === "unavailable" ? (
        <p className="text-pretty text-xs text-muted-foreground">
          {analysis.unavailableReason ?? "The analysis engine could not run."}
        </p>
      ) : analysis.uncertainty ? (
        <p className="text-pretty text-xs text-muted-foreground">{analysis.uncertainty}</p>
      ) : null}

      {analysis.safetyWarning ? (
        <p className="flex items-start gap-1.5 text-pretty text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{analysis.safetyWarning}</span>
        </p>
      ) : null}

      {analysis.status !== "unavailable" && analysis.curiosityPrompt ? (
        <p className="text-pretty text-xs text-forest">
          <span className="font-medium">Ask yourself:</span> {analysis.curiosityPrompt}
        </p>
      ) : null}
    </div>
  );
}

function FieldNotes({ observation }: { observation: Observation }) {
  const preferences = usePreferences();
  const query = React.useMemo(
    () => observationQuery(observation.note, observation.analysis),
    [observation.note, observation.analysis]
  );
  const allowServer = preferences?.privacyMode !== "LOCAL_ONLY";
  const [hits, setHits] = React.useState<KnowledgeHit[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    setHits([]);
    if (!query) return;
    void (async () => {
      try {
        const result = await retrieveKnowledge({
          query,
          category: observation.category,
          limit: 2,
          allowServer,
        });
        if (!cancelled) setHits(result.hits);
      } catch {
        // field notes are best-effort — the observation itself stands alone
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, allowServer, observation.category]);

  if (hits.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" aria-hidden />
        Field notes
      </p>
      {hits.map(({ record }) => {
        const fact =
          record.safeFacts[0] ??
          (record.traits.length > 0 ? record.traits.slice(0, 3).join(" · ") : record.habitat);
        const fromTiger = record.source === "tiger-database";
        return (
          <div key={record.id} className="space-y-0.5">
            <p className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-medium">{record.commonName}</span>
              {record.scientificName ? (
                <span className="italic text-muted-foreground">{record.scientificName}</span>
              ) : null}
              {fromTiger ? (
                <Badge variant="sky" className="text-[10px]">
                  Tiger knowledge base
                  {record.similarity !== null
                    ? ` · ${Math.round(record.similarity * 100)}% match`
                    : ""}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  Bundled field guide
                </Badge>
              )}
            </p>
            {fact ? (
              <p className="line-clamp-2 text-pretty text-xs text-muted-foreground">{fact}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

interface OnlineHit {
  title: string;
  link: string;
  snippet: string;
  source: string | null;
}

type OnlineState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; hits: OnlineHit[]; answer: string | null }
  | { status: "unavailable"; reason: string };

/** User-triggered SerpApi lookup — hidden entirely under LOCAL_ONLY. */
function OnlineContext({ observation }: { observation: Observation }) {
  const preferences = usePreferences();
  const allowServer = preferences?.privacyMode !== "LOCAL_ONLY";
  const query = React.useMemo(() => {
    const analysis = observation.analysis;
    if (analysis && analysis.status !== "unavailable" && analysis.commonName) {
      return [analysis.commonName, analysis.scientificName].filter(Boolean).join(" ").slice(0, 300);
    }
    return observationQuery(observation.note, observation.analysis);
  }, [observation.note, observation.analysis]);
  const [state, setState] = React.useState<OnlineState>({ status: "idle" });
  const [expanded, setExpanded] = React.useState(false);

  if (!allowServer || !query) return null;

  async function lookOnline() {
    setExpanded(true);
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 4 }),
      });
      const body = (await response.json()) as {
        kind?: string;
        answer?: string | null;
        results?: OnlineHit[];
        reason?: string;
      };
      if (body.kind === "ok" && Array.isArray(body.results)) {
        setState({ status: "done", hits: body.results, answer: body.answer ?? null });
      } else {
        setState({
          status: "unavailable",
          reason: body.reason ?? "Online lookup is unavailable on this deployment.",
        });
      }
    } catch {
      setState({ status: "unavailable", reason: "The enrichment service did not answer." });
    }
  }

  return (
    <div className="mt-2">
      {!expanded ? (
        <button
          type="button"
          onClick={() => void lookOnline()}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          Look online
        </button>
      ) : (
        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Globe className="h-3.5 w-3.5" aria-hidden />
            Online context · Google via SerpApi
          </p>
          {state.status === "loading" ? (
            <p className="text-xs text-muted-foreground">Searching…</p>
          ) : state.status === "unavailable" ? (
            <p className="text-pretty text-xs text-muted-foreground">{state.reason}</p>
          ) : state.status === "done" ? (
            <>
              {state.answer ? (
                <p className="text-pretty border-l-2 border-forest/40 pl-2 text-xs">
                  {state.answer}
                </p>
              ) : null}
              {state.hits.length === 0 && !state.answer ? (
                <p className="text-xs text-muted-foreground">
                  Google returned no results for this query.
                </p>
              ) : (
                state.hits.slice(0, 3).map((hit) => (
                  <div key={hit.link} className="space-y-0.5">
                    <a
                      href={hit.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="line-clamp-1 text-xs font-medium text-sky underline-offset-2 hover:underline"
                    >
                      {hit.title}
                    </a>
                    {hit.snippet ? (
                      <p className="line-clamp-2 text-pretty text-xs text-muted-foreground">
                        {hit.snippet}
                      </p>
                    ) : null}
                    {hit.source ? (
                      <p className="text-[10px] text-muted-foreground">{hit.source}</p>
                    ) : null}
                  </div>
                ))
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function ObservationCard({ observation }: { observation: Observation }) {
  const [thumbUrl, setThumbUrl] = React.useState<string | null>(null);
  const analyzing = useObservationAnalyzing(observation.id);

  React.useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    if (observation.type !== "photo" || observation.mediaIds.length === 0) return;
    void (async () => {
      try {
        const asset = await mediaRepository.getAsset(observation.mediaIds[0]!);
        if (!asset) return;
        const record = await mediaRepository.getBlob(asset.blobKey);
        if (!record || cancelled) return;
        objectUrl = URL.createObjectURL(record.blob);
        setThumbUrl(objectUrl);
      } catch {
        // thumbnail is best-effort — the observation itself is intact
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [observation.type, observation.mediaIds]);

  const category = CATEGORY_META[observation.category];

  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-card p-3.5">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/50">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob thumbnail
          <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : observation.type === "audio" ? (
          <Mic className="h-5 w-5 text-muted-foreground" aria-hidden />
        ) : observation.type === "note" ? (
          <StickyNote className="h-5 w-5 text-muted-foreground" aria-hidden />
        ) : (
          <span className="text-xl" aria-hidden>
            {category.emoji}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="gap-1 text-[11px]">
            <span aria-hidden>{category.emoji}</span>
            {category.label}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {relativeTime(observation.capturedAt)}
          </span>
        </div>
        {observation.note ? (
          <p className="mt-1.5 line-clamp-3 text-pretty text-sm">{observation.note}</p>
        ) : (
          <p className="mt-1.5 text-sm italic text-muted-foreground">
            {observation.type === "photo"
              ? "Photo evidence"
              : observation.type === "audio"
                ? "Sound recorded"
                : "No note"}
          </p>
        )}
        {analyzing ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-forest" aria-hidden />
            Understanding…
          </p>
        ) : observation.analysis ? (
          <AnalysisBlock
            analysis={observation.analysis}
            observationCategory={observation.category}
          />
        ) : null}
        <FieldNotes observation={observation} />
        <OnlineContext observation={observation} />
      </div>
    </div>
  );
}
