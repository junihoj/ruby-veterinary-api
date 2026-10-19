import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateAppointmentRequestCommand } from '../commands/create-appointment-request.command';
import { CreateIntakeSubmissionCommand } from '../commands/create-intake-submission.command';
import { SignUploadCommand } from '../commands/sign-upload.command';
import { TriageAppointmentRequestCommand } from '../commands/triage-appointment-request.command';
import { UpdateIntakeSubmissionCommand } from '../commands/update-intake-submission.command';
import { AcceptIntakeSubmissionCommand } from '../commands/accept-intake-submission.command';
import { UpdateHistoryUploadCommand } from '../commands/update-history-upload.command';
import {
  AcceptIntakeResultDto,
  AppointmentRequestDto,
  CreateAppointmentRequestResultDto,
  CreateIntakeSubmissionResultDto,
  HistoryUploadDto,
  IntakeStatusDto,
  IntakeSubmissionDto,
  SignUploadResultDto,
  UploadUrlDto,
} from '../dto/care.responses.dto';
import { GetHistoryUploadUrlQuery } from '../queries/get-history-upload-url.query';
import { GetIntakeStatusQuery } from '../queries/get-intake-status.query';
import { ListAppointmentRequestsQuery } from '../queries/list-appointment-requests.query';
import { ListHistoryUploadsQuery } from '../queries/list-history-uploads.query';
import { ListIntakeSubmissionsQuery } from '../queries/list-intake-submissions.query';
import {
  CareCoordinationFacadePort,
  PagedResult,
} from './care-coordination-facade-port';

/**
 * Concrete facade for the CareCoordination context (§3). Body is bus
 * delegation only — no business logic. Handlers own the behaviour.
 */
@Injectable()
export class CareCoordinationFacade extends CareCoordinationFacadePort {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {
    super();
  }

  createAppointmentRequest(
    command: CreateAppointmentRequestCommand,
  ): Promise<CreateAppointmentRequestResultDto> {
    return this.commands.execute(command);
  }
  createIntakeSubmission(
    command: CreateIntakeSubmissionCommand,
  ): Promise<CreateIntakeSubmissionResultDto> {
    return this.commands.execute(command);
  }
  signUpload(command: SignUploadCommand): Promise<SignUploadResultDto> {
    return this.commands.execute(command);
  }
  getIntakeStatus(query: GetIntakeStatusQuery): Promise<IntakeStatusDto> {
    return this.queries.execute(query);
  }
  listAppointmentRequests(
    query: ListAppointmentRequestsQuery,
  ): Promise<PagedResult<AppointmentRequestDto>> {
    return this.queries.execute(query);
  }
  triageAppointmentRequest(
    command: TriageAppointmentRequestCommand,
  ): Promise<AppointmentRequestDto> {
    return this.commands.execute(command);
  }
  listIntakeSubmissions(
    query: ListIntakeSubmissionsQuery,
  ): Promise<PagedResult<IntakeSubmissionDto>> {
    return this.queries.execute(query);
  }
  updateIntakeSubmission(
    command: UpdateIntakeSubmissionCommand,
  ): Promise<IntakeSubmissionDto> {
    return this.commands.execute(command);
  }
  acceptIntakeSubmission(
    command: AcceptIntakeSubmissionCommand,
  ): Promise<AcceptIntakeResultDto> {
    return this.commands.execute(command);
  }
  listHistoryUploads(
    query: ListHistoryUploadsQuery,
  ): Promise<PagedResult<HistoryUploadDto>> {
    return this.queries.execute(query);
  }
  getHistoryUploadUrl(query: GetHistoryUploadUrlQuery): Promise<UploadUrlDto> {
    return this.queries.execute(query);
  }
  updateHistoryUpload(
    command: UpdateHistoryUploadCommand,
  ): Promise<HistoryUploadDto> {
    return this.commands.execute(command);
  }
}
