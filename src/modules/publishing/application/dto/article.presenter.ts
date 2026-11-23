import { Injectable } from '@nestjs/common';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ObjectStoragePort } from '../../../../shared/storage/object-storage.port';
import { ClinicContentFacadePort } from '../../../clinic-content/application/facades/clinic-content-facade-port';
import type { StaffProfileDto } from '../../../clinic-content/application/dto/clinic-content.dto';
import type {
  ArticleCardRow,
  ArticleDetailRow,
} from '../../infrastructure/repositories/article.repository';
import {
  toArticleAuthor,
  toArticleDetail,
  toArticleSummary,
} from './publishing.mapper';
import {
  ArticleAuthorDto,
  ArticleDetailDto,
  ArticleSummaryDto,
} from './publishing.responses.dto';

/**
 * Enriches article rows with the two things the publishing schema does not
 * own: the published staff byline (Clinic Content) and a short-lived cover
 * URL (object storage). Signing failures degrade to `coverUrl: null` so a
 * storage hiccup never takes down public reads.
 */
@Injectable()
export class ArticlePresenter {
  constructor(
    private readonly clinicContent: ClinicContentFacadePort,
    private readonly storage: ObjectStoragePort,
  ) {}

  private async coverUrl(key: string | null): Promise<string | null> {
    if (!key) return null;
    try {
      return (await this.storage.presignDownload(key)).url;
    } catch {
      return null;
    }
  }

  private async authorsFor(
    rows: Array<{ authorProfileId: string | null }>,
  ): Promise<Map<string, ArticleAuthorDto>> {
    const ids = [
      ...new Set(
        rows
          .map((row) => row.authorProfileId)
          .filter((id): id is string => id !== null),
      ),
    ];
    if (ids.length === 0) return new Map();

    const profiles = await this.clinicContent.listStaffProfilesByIds(ids);
    const byId = new Map<string, ArticleAuthorDto>();
    for (const profile of profiles) {
      const bareId = PrefixedId.tryAnyToUuid(profile.id);
      if (bareId)
        byId.set(bareId, toArticleAuthor(profile) as ArticleAuthorDto);
    }
    return byId;
  }

  async presentSummaries(rows: ArticleCardRow[]): Promise<ArticleSummaryDto[]> {
    const [authors, covers] = await Promise.all([
      this.authorsFor(rows),
      Promise.all(rows.map((row) => this.coverUrl(row.coverObjectKey))),
    ]);
    return rows.map((row, index) =>
      toArticleSummary(
        row,
        row.authorProfileId ? (authors.get(row.authorProfileId) ?? null) : null,
        covers[index],
      ),
    );
  }

  async presentDetail(
    row: ArticleDetailRow,
    relatedRows: ArticleCardRow[],
  ): Promise<ArticleDetailDto> {
    const allRows: ArticleCardRow[] = [row, ...relatedRows];
    const [authors, covers] = await Promise.all([
      this.authorsFor(allRows),
      Promise.all(allRows.map((item) => this.coverUrl(item.coverObjectKey))),
    ]);

    const related = relatedRows.map((item, index) =>
      toArticleSummary(
        item,
        item.authorProfileId
          ? (authors.get(item.authorProfileId) ?? null)
          : null,
        covers[index + 1],
      ),
    );

    return toArticleDetail(
      row,
      row.authorProfileId ? (authors.get(row.authorProfileId) ?? null) : null,
      covers[0],
      related,
    );
  }

  /** Used by create/update/publish handlers to return the fresh detail. */
  async presentRow(row: ArticleDetailRow): Promise<ArticleDetailDto> {
    return this.presentDetail(row, this.relatedRows(row));
  }

  private relatedRows(row: ArticleDetailRow): ArticleCardRow[] {
    return row.relationsFrom
      .map((link) => link.relatedArticle)
      .filter((related) => related.status === 'published');
  }

  /** Profile → author for a single assignment response. */
  toAuthor(profile: StaffProfileDto | null): ArticleAuthorDto | null {
    return toArticleAuthor(profile);
  }
}
