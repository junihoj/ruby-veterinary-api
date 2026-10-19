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

/** Shared page shape (commerce PagedResult twin). */
export interface PagedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Public API of the CareCoordination context (§6.1). Other modules depend
 * only on this abstract port, bound to the concrete facade with
 * `useExisting` (§3). Schema: intake.
 */
export abstract class CareCoordinationFacadePort {
  abstract createAppointmentRequest(
    command: CreateAppointmentRequestCommand,
  ): Promise<CreateAppointmentRequestResultDto>;
  abstract createIntakeSubmission(
    command: CreateIntakeSubmissionCommand,
  ): Promise<CreateIntakeSubmissionResultDto>;
  abstract signUpload(command: SignUploadCommand): Promise<SignUploadResultDto>;
  abstract getIntakeStatus(
    query: GetIntakeStatusQuery,
  ): Promise<IntakeStatusDto>;

  abstract listAppointmentRequests(
    query: ListAppointmentRequestsQuery,
  ): Promise<PagedResult<AppointmentRequestDto>>;
  abstract triageAppointmentRequest(
    command: TriageAppointmentRequestCommand,
  ): Promise<AppointmentRequestDto>;
  abstract listIntakeSubmissions(
    query: ListIntakeSubmissionsQuery,
  ): Promise<PagedResult<IntakeSubmissionDto>>;
  abstract updateIntakeSubmission(
    command: UpdateIntakeSubmissionCommand,
  ): Promise<IntakeSubmissionDto>;
  abstract acceptIntakeSubmission(
    command: AcceptIntakeSubmissionCommand,
  ): Promise<AcceptIntakeResultDto>;
  abstract listHistoryUploads(
    query: ListHistoryUploadsQuery,
  ): Promise<PagedResult<HistoryUploadDto>>;
  abstract getHistoryUploadUrl(
    query: GetHistoryUploadUrlQuery,
  ): Promise<UploadUrlDto>;
  abstract updateHistoryUpload(
    command: UpdateHistoryUploadCommand,
  ): Promise<HistoryUploadDto>;
}
