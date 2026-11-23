import { Injectable, Logger } from '@nestjs/common';

// Interface partagee avec le module leasing (rappels de visite).
// Tant qu'aucun fournisseur reel n'est choisi (phase 4), l'implementation
// ecrit le message dans le journal du serveur (EF-401).
export interface SmsSender {
  send(phone: string, message: string): Promise<void>;
}

export const SMS_SENDER = 'SMS_SENDER';

@Injectable()
export class LogSmsSender implements SmsSender {
  private readonly logger = new Logger('sms');

  send(phone: string, message: string): Promise<void> {
    this.logger.log(`SMS pour ${phone} : ${message}`);
    return Promise.resolve();
  }
}
