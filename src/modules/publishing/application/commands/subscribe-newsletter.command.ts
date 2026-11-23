import { SubscribeNewsletterDto } from '../dto/publishing.requests.dto';

/** POST /newsletter/subscribe — pending capture only in M7. */
export class SubscribeNewsletterCommand {
  constructor(public readonly input: SubscribeNewsletterDto) {}
}
