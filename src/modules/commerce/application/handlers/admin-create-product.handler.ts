import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ProductRepository } from '../../infrastructure/repositories/product.repository';
import { assertShapeInvariants, slugify } from '../product-shape';
import { AdminCreateProductCommand } from '../commands/admin-create-product.command';
import { toProductDetail } from '../dto/commerce.mapper';
import { ProductDetailDto } from '../dto/commerce.responses.dto';
import { badRequest } from '../errors';

@CommandHandler(AdminCreateProductCommand)
export class AdminCreateProductHandler implements ICommandHandler<AdminCreateProductCommand> {
  constructor(private readonly products: ProductRepository) {}

  async execute(command: AdminCreateProductCommand): Promise<ProductDetailDto> {
    // Parse before touching Prisma: a malformed category id would raise a
    // client validation error (500) instead of the designed 400.
    const categoryId = PrefixedId.tryAnyToUuid(command.input.categoryId);
    if (!categoryId) throw badRequest('Unknown category.');
    const category = await this.products.findCategory(categoryId);
    if (!category) throw badRequest('Unknown category.');

    const slug = command.input.slug ?? slugify(command.input.name);
    if (await this.products.slugExists(slug)) {
      throw badRequest('Slug already in use.');
    }

    const productType = command.input.productType;
    const pricingMode =
      productType === 'composite'
        ? (command.input.pricingMode ?? 'fixed')
        : null;
    const externalUrl =
      productType === 'external' ? (command.input.externalUrl ?? null) : null;
    assertShapeInvariants(productType, externalUrl, pricingMode);

    // Creates a draft (published defaults to false) — variant seeding for the
    // new product is out-of-band until an admin variants surface exists.
    const row = await this.products.createProduct({
      categoryId,
      name: command.input.name,
      slug,
      summary: command.input.summary ?? '',
      productType,
      isVirtual: command.input.isVirtual ?? false,
      isDownloadable: command.input.isDownloadable ?? false,
      pricingMode,
      externalUrl,
      buttonText:
        productType === 'external' ? (command.input.buttonText ?? null) : null,
      requiresPrescription: command.input.requiresPrescription ?? false,
      requiresPetClaim: command.input.requiresPetClaim ?? false,
      published: command.input.published ?? false,
      featured: command.input.featured ?? false,
      descriptionMd: command.input.descriptionMd ?? null,
    });

    return toProductDetail(row);
  }
}
