import { Injectable, NotImplementedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { rowsOf } from '../audit/sql-runner';

// Dependance vers le module listings (Marrich) : une visite et un bail sont
// rattaches a un bien publie. Le module listings n'est pas encore livre ;
// cette implementation simulee lit la table du contrat. Elle sera remplacee
// par un appel a GET /properties/{propertyId} ou au service listings.
export interface PublishedProperty {
  id: string;
  agentId: string;
  status: string;
  title: string;
}

export interface PropertyLookup {
  findPublished(propertyId: string): Promise<PublishedProperty | undefined>;
}

export const PROPERTY_LOOKUP = 'PROPERTY_LOOKUP';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class SimulatedPropertyLookup implements PropertyLookup {
  constructor(private readonly dataSource: DataSource) {}

  async findPublished(
    propertyId: string,
  ): Promise<PublishedProperty | undefined> {
    if (typeof propertyId !== 'string' || !UUID_RE.test(propertyId)) {
      return undefined;
    }
    const rows = rowsOf<{
      id: string;
      agent_id: string;
      status: string;
      title: string;
    }>(
      await this.dataSource.query(
        `SELECT id, agent_id, status, title FROM simulated_properties
          WHERE id = $1 AND status = 'PUBLIE'`,
        [propertyId],
      ),
    );
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return {
      id: row.id,
      agentId: row.agent_id,
      status: row.status,
      title: row.title,
    };
  }
}

// EF-309 (phase 3) : le paiement mobile Flooz et T-Money (Mixx by Yas)
// reste une interface vide, sans implementation reelle ni route.
export interface MobileMoneyProvider {
  collectRent(input: {
    leaseId: string;
    rentId: string;
    amount: number;
    payerPhone: string;
  }): Promise<never>;
}

export const MOBILE_MONEY_PROVIDER = 'MOBILE_MONEY_PROVIDER';

@Injectable()
export class UnavailableMobileMoneyProvider implements MobileMoneyProvider {
  collectRent(): Promise<never> {
    return Promise.reject(
      new NotImplementedException({
        code: 'NOT_IMPLEMENTED',
        message: 'Le paiement mobile arrive en phase 3.',
      }),
    );
  }
}
