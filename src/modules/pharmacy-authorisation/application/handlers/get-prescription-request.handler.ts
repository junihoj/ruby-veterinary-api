import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ClientRecordsFacadePort } from '../../../client-patient-records/application/facades/client-records-facade-port';
import { GetClientQuery } from '../../../client-patient-records/application/queries/get-client.query';
import { GetPetQuery } from '../../../client-patient-records/application/queries/get-pet.query';
import { GetPrescriptionRequestQuery } from '../queries/get-prescription-request.query';
import {
  toPrescriptionDecisionDto,
  toPrescriptionRequestDto,
} from '../dto/pharmacy.mapper';
import { PrescriptionRequestDetailDto } from '../dto/pharmacy.responses.dto';
import { notFound } from '../errors';
import { PrescriptionRequestRepository } from '../../infrastructure/repositories/prescription-request.repository';
import { PrescriptionDecisionRepository } from '../../infrastructure/repositories/prescription-decision.repository';
import { RxAuditRepository } from '../../infrastructure/repositories/rx-audit.repository';
import { PatientAssociationRepository } from '../../infrastructure/repositories/patient-association.repository';

/**
 * GET /prescriptions/{id} — request with patient context and decision
 * history. Every view appends a `viewed` rx_audit_log row (ADR-0012: export
 * and view actions are logged); an open request takes its first
 * patient-association snapshot on first view (insert-if-none, so repeated
 * views never duplicate).
 */
@QueryHandler(GetPrescriptionRequestQuery)
export class GetPrescriptionRequestHandler implements IQueryHandler<GetPrescriptionRequestQuery> {
  constructor(
    private readonly requests: PrescriptionRequestRepository,
    private readonly decisions: PrescriptionDecisionRepository,
    private readonly audit: RxAuditRepository,
    private readonly associations: PatientAssociationRepository,
    private readonly clientRecords: ClientRecordsFacadePort,
  ) {}

  async execute(
    query: GetPrescriptionRequestQuery,
  ): Promise<PrescriptionRequestDetailDto> {
    const uuid = PrefixedId.tryAnyToUuid(query.id);
    if (uuid === null) throw notFound('Prescription request not found.');
    const row = await this.requests.findById(uuid);
    if (!row) throw notFound('Prescription request not found.');

    // Patient + client context via the facade port (never a cross-schema read).
    const petId = PrefixedId.format('pet', row.petId);
    let petName = 'Unknown pet';
    let clientId: string | null = null;
    try {
      const pet = await this.clientRecords.getPet(new GetPetQuery(petId));
      petName = pet.name;
      clientId = pet.clientId;
    } catch {
      // Deleted pet — the request and its history stay readable.
    }
    let clientName: string | undefined;
    if (clientId) {
      try {
        const client = await this.clientRecords.getClient(
          new GetClientQuery(clientId),
        );
        clientName = client.displayName;
      } catch {
        // Deleted client — omit the block.
      }
    }

    const decisionRows = await this.decisions.listByRequest(uuid);

    // Audit + snapshot (both append-only paths, ADR-0012).
    await this.audit.append({
      prescriptionRequestId: uuid,
      actorUserId:
        PrefixedId.tryAnyToUuid(query.actorUserId) ?? query.actorUserId,
      action: 'viewed',
      requestId: query.requestId,
    });
    if (row.status === 'pending' || row.status === 'queried') {
      await this.associations.snapshotIfNone({
        prescriptionRequestId: uuid,
        petId: row.petId,
        veterinarianUserId: row.veterinarianUserId,
        clientId,
      });
    }

    const base = toPrescriptionRequestDto(row);
    return {
      ...base,
      pet: { id: base.petId, name: petName },
      ...(clientName && clientId
        ? { client: { id: clientId, displayName: clientName } }
        : {}),
      decisions: decisionRows.map(toPrescriptionDecisionDto),
    };
  }
}
