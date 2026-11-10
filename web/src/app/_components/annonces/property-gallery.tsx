"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Property } from "@/lib/data";
import { photosFor } from "@/lib/photos";
import { CertBadge } from "../badges";
import { ParcelThumb } from "./parcel-thumb";
import { LISTINGS_DEMO_ENABLED } from "@/lib/listings-api";

type Slide =
  | { kind: "photo"; src: string; label: string }
  | { kind: "plan"; label: string }
  | { kind: "empty"; label: string };

export function PropertyGallery({ property }: { property: Property }) {
  const [a, b] = photosFor(property);
  const slides: Slide[] = [
    ...(a ? [{ kind: "photo" as const, src: a, label: "Vue principale" }] : []),
    ...(b && b !== a
      ? [{ kind: "photo" as const, src: b, label: "Vue extérieure" }]
      : []),
    ...(LISTINGS_DEMO_ENABLED
      ? [{ kind: "plan" as const, label: "Emprise levée RTK" }]
      : []),
    ...(!a && !LISTINGS_DEMO_ENABLED
      ? [{ kind: "empty" as const, label: "Aucune photo disponible" }]
      : []),
  ];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => (i - 1 + slides.length) % slides.length);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => (i + 1) % slides.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  const slide = slides[index];

  return (
    <div>
      <div className="relative h-[240px] overflow-hidden bg-[var(--surface-sunken)]">
        {slide.kind === "photo" ? (
          <Image
            src={slide.src}
            alt={`${property.title} - ${slide.label}`}
            fill
            sizes="(max-width: 768px) 100vw, 480px"
            className="object-cover"
            priority={index === 0}
          />
        ) : slide.kind === "plan" ? (
          <ParcelThumb property={property} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)] text-sm text-[var(--text-muted)]">
            Aucune photo disponible
          </div>
        )}
        <div className="absolute left-4 top-4">
          <CertBadge certified={property.parcelCertified} kind="parcelle" />
        </div>
        <span className="absolute right-4 top-4 rounded-full bg-[rgba(8,20,28,0.6)] px-2.5 py-1 text-[12px] font-semibold text-white">
          {index + 1} / {slides.length}
        </span>
        <button
          className="gs-iconbtn absolute left-3 top-1/2 -translate-y-1/2"
          aria-label="Visuel précédent"
          onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="gs-iconbtn absolute right-3 top-1/2 -translate-y-1/2"
          aria-label="Visuel suivant"
          onClick={() => setIndex((i) => (i + 1) % slides.length)}
        >
          <ChevronRight size={18} />
        </button>
        <span className="absolute bottom-3 left-4 rounded-full bg-[rgba(8,20,28,0.6)] px-2.5 py-1 text-[12px] font-medium text-white">
          {slide.label}
        </span>
      </div>
      <div className="flex gap-2 border-b border-[var(--border)] bg-[var(--surface)] p-2">
        {slides.map((s, i) => (
          <button
            key={i}
            className={`relative h-14 flex-1 overflow-hidden rounded-md ring-2 transition ${
              i === index ? "ring-[var(--primary)]" : "ring-transparent opacity-70 hover:opacity-100"
            }`}
            aria-label={`Afficher ${s.label}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
          >
            {s.kind === "photo" ? (
              <Image src={s.src} alt="" fill sizes="120px" className="object-cover" />
            ) : s.kind === "plan" ? (
              <ParcelThumb property={property} />
            ) : (
              <div className="flex h-full items-center justify-center bg-[var(--surface-sunken)] text-[11px] text-[var(--text-muted)]">
                Sans photo
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}