"use client";

import Image from "next/image";
import type { Property } from "@/lib/data";
import { TYPE_LABEL } from "@/lib/data";
import { formatPrice, formatSurface } from "@/lib/format";
import { CertBadge, LegalBadge } from "../badges";
import { ParcelThumb } from "./parcel-thumb";
import { LISTINGS_DEMO_ENABLED } from "@/lib/listings-api";

export function PropertyCard({
  property,
  hovered,
  selected,
  onHover,
  onSelect,
}: {
  property: Property;
  hovered: boolean;
  selected: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const active = hovered || selected;
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Voir le bien ${property.title}`}
      onClick={() => onSelect(property.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(property.id);
        }
      }}
      onMouseEnter={() => onHover(property.id)}
      onMouseLeave={() => onHover(null)}
      className="gs-card gs-card--flush group flex h-full cursor-pointer flex-col text-left transition-[box-shadow,border-color,transform] duration-150"
      style={{
        borderColor: active ? "var(--primary)" : undefined,
        boxShadow: active ? "var(--shadow-2)" : undefined,
        transform: active ? "translateY(-2px)" : undefined,
      }}
    >
      <div className="relative h-[170px] overflow-hidden">
        {property.remotePhotos?.[0] ? (
          <Image
            src={property.remotePhotos[0]}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.05]"
          />
        ) : (
          LISTINGS_DEMO_ENABLED ? (
            <div className="absolute inset-0 transition-transform duration-300 ease-out group-hover:scale-[1.05]">
              <ParcelThumb property={property} />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)] text-sm text-[var(--text-muted)]">
              Photo non disponible
            </div>
          )
        )}
        <div className="absolute left-3 top-3">
          <CertBadge certified={property.parcelCertified} kind="parcelle" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="gs-display text-[18px] font-bold leading-[26px]">
          {formatPrice(property.price)}
          {property.transaction === "LOCATION" && (
            <span className="text-[13px] font-medium text-[var(--text-muted)]"> /mois</span>
          )}
        </p>
        <p className="text-[13px] leading-[18px] text-[var(--text-muted)]">
          {TYPE_LABEL[property.type]}{" "}
          {formatSurface(property.surfaceM2)} · {property.zone}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <LegalBadge status={property.legalStatus} />
          <CertBadge certified={property.agentCertified} kind="agent" />
        </div>
        <p className="gs-data-sm mt-auto pt-1 text-[var(--text-muted)]">{property.parcelId}</p>
      </div>
    </article>
  );
}