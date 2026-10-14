import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ProductListFilters } from '../../application/queries/list-products.query';

const categorySelect = { select: { id: true, name: true, slug: true } };

const listInclude = {
  category: categorySelect,
  variants: {
    where: { active: true },
    orderBy: [{ isDefault: 'desc' }, { price: 'asc' }],
  },
} satisfies Prisma.ProductInclude;

const detailInclude = {
  category: categorySelect,
  variants: { orderBy: [{ isDefault: 'desc' }, { price: 'asc' }] },
  facets: { include: { facet: { select: { facetType: true, value: true } } } },
  groupedParent: {
    orderBy: { sortOrder: 'asc' },
    include: {
      memberProduct: {
        select: {
          id: true,
          name: true,
          slug: true,
          summary: true,
          variants: {
            where: { active: true },
            orderBy: [{ isDefault: 'desc' }, { price: 'asc' }],
          },
        },
      },
    },
  },
  compositeSlots: {
    orderBy: { position: 'asc' },
    include: {
      options: {
        orderBy: { sortOrder: 'asc' },
        include: { product: { select: { id: true, name: true, slug: true } } },
      },
    },
  },
} satisfies Prisma.ProductInclude;

/**
 * Product catalog reads/writes (commerce.md products). Public reads only see
 * published rows; admin writes go through the same detail payload so the
 * seven product shapes serialise identically everywhere.
 */
@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(
    limit: number,
    cursor: string | undefined,
    filters: ProductListFilters,
  ) {
    const byFacet = (
      facetType: string,
      value: string,
    ): Prisma.ProductWhereInput => ({
      facets: {
        some: {
          facet: { facetType, value: { equals: value, mode: 'insensitive' } },
        },
      },
    });

    return this.prisma.product.findMany({
      where: {
        published: true,
        ...(filters.category ? { category: { slug: filters.category } } : {}),
        ...(filters.q
          ? {
              OR: [
                { name: { contains: filters.q, mode: 'insensitive' } },
                { summary: { contains: filters.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        AND: [
          ...(filters.petType ? [byFacet('pet_type', filters.petType)] : []),
          ...(filters.lifeStage
            ? [byFacet('life_stage', filters.lifeStage)]
            : []),
          ...(filters.condition
            ? [byFacet('health_condition', filters.condition)]
            : []),
        ],
      },
      include: listInclude,
      orderBy: [{ featured: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async findPublishedBySlug(slug: string) {
    return this.prisma.product.findFirst({
      where: { slug, published: true },
      include: detailInclude,
    });
  }

  async findDetail(id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      include: detailInclude,
    });
  }

  async findVariantWithProduct(variantId: string) {
    return this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { include: { category: categorySelect } } },
    });
  }

  async findCategory(id: string) {
    return this.prisma.productCategory.findUnique({ where: { id } });
  }

  async slugExists(slug: string, exceptId?: string): Promise<boolean> {
    const row = await this.prisma.product.findFirst({
      where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  }

  async createProduct(data: {
    categoryId: string;
    name: string;
    slug: string;
    summary: string;
    productType: string;
    isVirtual: boolean;
    isDownloadable: boolean;
    pricingMode: string | null;
    externalUrl: string | null;
    buttonText: string | null;
    requiresPrescription: boolean;
    requiresPetClaim: boolean;
    published: boolean;
    featured: boolean;
    descriptionMd: string | null;
  }) {
    return this.prisma.product.create({ data, include: detailInclude });
  }

  async updateProduct(id: string, data: Prisma.ProductUpdateInput) {
    return this.prisma.product.update({
      where: { id },
      data,
      include: detailInclude,
    });
  }

  /**
   * Variant maintenance. Setting stockQuantity below the currently reserved
   * count is an explicit staff override (available clamps at 0 on read).
   */
  async updateVariant(
    variantId: string,
    data: Prisma.ProductVariantUpdateInput,
  ) {
    return this.prisma.productVariant.update({
      where: { id: variantId },
      data,
    });
  }
}
