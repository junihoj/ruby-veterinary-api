import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApprovePrescriptionCommand } from '../commands/approve-prescription.command';
import { QueryPrescriptionCommand } from '../commands/query-prescription.command';
import { RejectPrescriptionCommand } from '../commands/reject-prescription.command';
import { SubmitPrescriptionHoldCommand } from '../commands/submit-prescription-hold.command';
import {
  PagedResult,
  PrescriptionQueueItemDto,
  PrescriptionRequestDto,
  PrescriptionRequestDetailDto,
} from '../dto/pharmacy.responses.dto';
import { GetPrescriptionRequestQuery } from '../queries/get-prescription-request.query';
import {
  GetOrderPrescriptionStatusQuery,
  IsOrderApprovedQuery,
} from '../queries/order-prescription-state.query';
import { ListPrescriptionQueueQuery } from '../queries/list-prescription-queue.query';
import { PharmacyFacadePort } from './pharmacy-facade-port';

/**
 * Concrete facade for the PharmacyAuthorisation context (§3). Body is bus
 * delegation only — no business logic. Handlers own the behaviour.
 */
@Injectable()
export class PharmacyAuthorisationFacade extends PharmacyFacadePort {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {
    super();
  }

  submitHold(
    command: SubmitPrescriptionHoldCommand,
  ): Promise<PrescriptionRequestDto[]> {
    return this.commands.execute(command);
  }
  listQueue(
    query: ListPrescriptionQueueQuery,
  ): Promise<PagedResult<PrescriptionQueueItemDto>> {
    return this.queries.execute(query);
  }
  getRequest(
    query: GetPrescriptionRequestQuery,
  ): Promise<PrescriptionRequestDetailDto> {
    return this.queries.execute(query);
  }
  approve(
    command: ApprovePrescriptionCommand,
  ): Promise<PrescriptionRequestDto> {
    return this.commands.execute(command);
  }
  reject(command: RejectPrescriptionCommand): Promise<PrescriptionRequestDto> {
    return this.commands.execute(command);
  }
  query(command: QueryPrescriptionCommand): Promise<PrescriptionRequestDto> {
    return this.commands.execute(command);
  }
  getOrderStatus(orderId: string): Promise<string | null> {
    return this.queries.execute(new GetOrderPrescriptionStatusQuery(orderId));
  }
  isApproved(orderId: string): Promise<boolean> {
    return this.queries.execute(new IsOrderApprovedQuery(orderId));
  }
}
