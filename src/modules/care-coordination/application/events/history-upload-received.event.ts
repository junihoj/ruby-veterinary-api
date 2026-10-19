import { IntegrationEvent } from '../../../../shared/integration/integration-event';

export interface HistoryUploadReceivedPayload {
  historyUploadId: string;
  /** Owning submission (null when the owner signed but never submitted). */
  sourceType: 'appointment_request' | 'intake_submission' | null;
  sourceId: string | null;
  mimeType: string;
  byteSize: number;
  fileName: string | null;
}

export class HistoryUploadReceived extends IntegrationEvent<HistoryUploadReceivedPayload> {
  readonly eventName = 'HistoryUploadReceived';
}
