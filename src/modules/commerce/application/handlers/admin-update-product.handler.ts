import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ProductRepository } from '../../infrastructure/repositories/product.repository';
import { AdminUpdateProductCommand } from '../commands/admin-update-product.command';
import { toProductDetail } from '../dto/commerce.mapper';
import { ProductTypeInput } from '../dto/commerce.requests.dto';
import { ProductDetailDto } from '../dto/commerce.responses.dto';
import { badRequest, notFound } from '../errors';
import { assertShapeInvariants } from '../product-shape';

@CommandHandler(AdminUpdateProductCommand)
export class AdminUpdateProductHandler implements ICommandHandler<AdminUpdateProductCommand> {
  constructor(private readonly products: ProductRepository) {}

  async execute(command: AdminUpdateProductCommand): Promise<ProductDetailDto> {
    // Malformed ids are 404 (contract PATCH: 200/401/403/404), never a
    // Prisma UUID error downstream.
    const productId = PrefixedId.tryAnyToUuid(command.productId);
    if (!productId) throw notFound('Product not found.');
    const product = await this.products.findDetail(productId);
    if (!product) throw notFound('Product not found.');
    const input = command.input;

    if (input.variantId) {
      // Variant maintenance (stock/price). Variant *creation* is not part of
      // the contract surface yet, so publish-time variant-count invariants
      // are not enforced here either. A malformed or foreign variant id is a
      // 404 (contract PATCH: 200/401/403/404) — never a Prisma UUID error.
      const variantUuid = PrefixedId.tryAnyToUuid(input.variantId);
      const variant = variantUuid
        ? product.variants.find((v) => v.id === variantUuid)
        : undefined;
      if (!variant) throw notFound('Variant not found on this product.');
      await this.products.updateVariant(variant.id, {
        ...(input.variantName !== undefined ? { name: input.variantName } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.compareAtPrice !== undefined
          ? { compareAtPrice: input.compareAtPrice }
          : {}),
        ...(input.stockQuantity !== undefined
          ? { stockQuantity: input.stockQuantity }
          : {}),
        ...(input.variantActive !== undefined
          ? { active: input.variantActive }
          : {}),
      });
      const refreshed = await this.products.findDetail(productId);
      return toProductDetail(refreshed as NonNullable<typeof refreshed>);
    }

    let categoryUuid: string | null = null;
    if (input.categoryId != null) {
      categoryUuid = PrefixedId.tryAnyToUuid(input.categoryId);
      const category = categoryUuid
        ? await this.products.findCategory(categoryUuid)
        : null;
      if (!category) throw badRequest('Unknown category.');
    }
    if (
      input.slug &&
      (await this.products.slugExists(input.slug, product.id))
    ) {
      throw badRequest('Slug already in use.');
    }

    // Validate the MERGED shape: partial updates must not leave an external
    // product without a URL or a composite without a pricing mode.
    const productType = (input.productType ??
      product.productType) as ProductTypeInput;
    const externalUrl =
      input.externalUrl !== undefined ? input.externalUrl : product.externalUrl;
    const pricingMode =
      input.pricingMode !== undefined ? input.pricingMode : product.pricingMode;
    assertShapeInvariants(productType, externalUrl, pricingMode);

    await this.products.updateProduct(productId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(categoryUuid ? { category: { connect: { id: categoryUuid } } } : {}),
      ...(input.productType !== undefined
        ? { productType: input.productType }
        : {}),
      ...(input.isVirtual !== undefined ? { isVirtual: input.isVirtual } : {}),
      ...(input.isDownloadable !== undefined
        ? { isDownloadable: input.isDownloadable }
        : {}),
      pricingMode,
      externalUrl,
      ...(input.buttonText !== undefined
        ? { buttonText: input.buttonText }
        : {}),
      ...(input.requiresPrescription !== undefined
        ? { requiresPrescription: input.requiresPrescription }
        : {}),
      ...(input.requiresPetClaim !== undefined
        ? { requiresPetClaim: input.requiresPetClaim }
        : {}),
      ...(input.published !== undefined ? { published: input.published } : {}),
      ...(input.featured !== undefined ? { featured: input.featured } : {}),
      ...(input.descriptionMd !== undefined
        ? { descriptionMd: input.descriptionMd }
        : {}),
    });

    const refreshed = await this.products.findDetail(productId);
    return toProductDetail(refreshed as NonNullable<typeof refreshed>);
  }
}
