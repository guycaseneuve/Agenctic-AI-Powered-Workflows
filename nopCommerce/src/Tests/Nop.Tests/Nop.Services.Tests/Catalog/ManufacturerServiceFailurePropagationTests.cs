using AwesomeAssertions;
using Moq;
using Nop.Core;
using Nop.Core.Caching;
using Nop.Core.Domain.Catalog;
using Nop.Core.Domain.Customers;
using Nop.Core.Domain.Discounts;
using Nop.Core.Domain.Stores;
using Nop.Data;
using Nop.Services.Catalog;
using Nop.Services.Customers;
using Nop.Services.Security;
using Nop.Services.Stores;
using NUnit.Framework;

namespace Nop.Tests.Nop.Services.Tests.Catalog;

[TestFixture]
[NonParallelizable]
public class ManufacturerServiceFailurePropagationTests
{
    [TestCase(true)]
    [TestCase(false)]
    public async Task GetManufacturersByCategoryIdAsync_DevelopmentFaultEnabled_ReturnsMatchingManufacturers(bool hasMatchingProducts)
    {
        const int categoryId = 12;
        var customer = new Customer();
        var store = new Store { Id = 3 };

        var catalogSettings = new CatalogSettings { ShowProductsFromSubcategories = true };
        var aclService = new Mock<IAclService>();
        var categoryService = new Mock<ICategoryService>();
        var customerService = new Mock<ICustomerService>();
        var manufacturerRepository = new Mock<IRepository<Manufacturer>>();
        var productManufacturerRepository = new Mock<IRepository<ProductManufacturer>>();
        var productCategoryRepository = new Mock<IRepository<ProductCategory>>();
        var productRepository = new Mock<IRepository<Product>>();
        var storeContext = new Mock<IStoreContext>();
        var storeMappingService = new Mock<IStoreMappingService>();
        var workContext = new Mock<IWorkContext>();
        var staticCacheManager = new Mock<IStaticCacheManager>();
        var expectedManufacturer = new Manufacturer { Id = 1, Name = "Matching manufacturer", Published = true };

        categoryService
            .Setup(service => service.GetChildCategoryIdsAsync(categoryId, store.Id, false))
            .ReturnsAsync([]);

        customerService
            .Setup(service => service.GetCustomerRoleIdsAsync(customer, false))
            .ReturnsAsync([]);
        storeContext
            .Setup(context => context.GetCurrentStoreAsync())
            .ReturnsAsync(store);
        workContext
            .Setup(context => context.GetCurrentCustomerAsync())
            .ReturnsAsync(customer);
        productRepository
            .Setup(repository => repository.Table)
            .Returns(new[]
            {
                new Product { Id = 1, Published = true },
                new Product { Id = 2, Published = true },
                new Product { Id = 3, Published = true, Deleted = true }
            }.AsQueryable());
        productCategoryRepository
            .Setup(repository => repository.Table)
            .Returns(new[]
            {
                new ProductCategory { ProductId = 1, CategoryId = hasMatchingProducts ? categoryId : categoryId + 1 },
                new ProductCategory { ProductId = 2, CategoryId = categoryId },
                new ProductCategory { ProductId = 3, CategoryId = categoryId }
            }.AsQueryable());
        manufacturerRepository
            .Setup(repository => repository.Table)
            .Returns(new[]
            {
                expectedManufacturer,
                new Manufacturer { Id = 2, Name = "Unpublished manufacturer", Published = false },
                new Manufacturer { Id = 3, Name = "Deleted product manufacturer", Published = true }
            }.AsQueryable());
        productManufacturerRepository
            .Setup(repository => repository.Table)
            .Returns(new[]
            {
                new ProductManufacturer { ProductId = 1, ManufacturerId = 1 },
                new ProductManufacturer { ProductId = 2, ManufacturerId = 2 },
                new ProductManufacturer { ProductId = 3, ManufacturerId = 3 }
            }.AsQueryable());
        storeMappingService
            .Setup(service => service.ApplyStoreMapping(It.IsAny<IQueryable<Product>>(), store.Id))
            .Returns((IQueryable<Product> query, int _) => Task.FromResult(query));
        aclService
            .Setup(service => service.ApplyAcl(It.IsAny<IQueryable<Product>>(), It.IsAny<int[]>()))
            .Returns((IQueryable<Product> query, int[] _) => Task.FromResult(query));
        storeMappingService
            .Setup(service => service.ApplyStoreMapping(It.IsAny<IQueryable<Manufacturer>>(), store.Id))
            .Returns((IQueryable<Manufacturer> query, int _) => Task.FromResult(query));
        aclService
            .Setup(service => service.ApplyAcl(It.IsAny<IQueryable<Manufacturer>>(), It.IsAny<int[]>()))
            .Returns((IQueryable<Manufacturer> query, int[] _) => Task.FromResult(query));
        staticCacheManager
            .Setup(cache => cache.GetAsync(
                It.IsAny<CacheKey>(),
                It.IsAny<Func<Task<IList<Manufacturer>>>>()))
            .Returns((CacheKey _, Func<Task<IList<Manufacturer>>> acquire) => acquire());

        var service = new ManufacturerService(
            catalogSettings,
            aclService.Object,
            categoryService.Object,
            customerService.Object,
            new Mock<IRepository<DiscountManufacturerMapping>>().Object,
            manufacturerRepository.Object,
            productRepository.Object,
            productManufacturerRepository.Object,
            productCategoryRepository.Object,
            staticCacheManager.Object,
            storeContext.Object,
            storeMappingService.Object,
            workContext.Object);

        var originalAspNetEnvironment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        var originalDotNetEnvironment = Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");
        var originalFaultEnabled = Environment.GetEnvironmentVariable("NOPCOMMERCE_ENABLE_CATALOG_FAULT_INJECTION");
        var originalFaultCategoryId = Environment.GetEnvironmentVariable("NOPCOMMERCE_CATALOG_FAULT_CATEGORY_ID");

        try
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
            Environment.SetEnvironmentVariable("DOTNET_ENVIRONMENT", null);
            Environment.SetEnvironmentVariable("NOPCOMMERCE_ENABLE_CATALOG_FAULT_INJECTION", "true");
            Environment.SetEnvironmentVariable("NOPCOMMERCE_CATALOG_FAULT_CATEGORY_ID", categoryId.ToString());

            var manufacturers = await service.GetManufacturersByCategoryIdAsync(categoryId);

            if (hasMatchingProducts)
                manufacturers.Should().ContainSingle().Which.Should().BeSameAs(expectedManufacturer);
            else
                manufacturers.Should().BeEmpty();

            categoryService.Verify(
                dependency => dependency.GetChildCategoryIdsAsync(categoryId, store.Id, false),
                Times.Once);
            productCategoryRepository.VerifyGet(repository => repository.Table, Times.Once);
            manufacturerRepository.VerifyGet(repository => repository.Table, Times.Once);
            storeMappingService.Verify(
                dependency => dependency.ApplyStoreMapping(It.IsAny<IQueryable<Manufacturer>>(), store.Id),
                Times.Once);
            aclService.Verify(
                dependency => dependency.ApplyAcl(It.IsAny<IQueryable<Manufacturer>>(), It.IsAny<int[]>()),
                Times.Once);
            staticCacheManager.Verify(
                cache => cache.GetAsync(
                    It.IsAny<CacheKey>(),
                    It.IsAny<Func<Task<IList<Manufacturer>>>>()),
                Times.Once);
        }
        finally
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", originalAspNetEnvironment);
            Environment.SetEnvironmentVariable("DOTNET_ENVIRONMENT", originalDotNetEnvironment);
            Environment.SetEnvironmentVariable("NOPCOMMERCE_ENABLE_CATALOG_FAULT_INJECTION", originalFaultEnabled);
            Environment.SetEnvironmentVariable("NOPCOMMERCE_CATALOG_FAULT_CATEGORY_ID", originalFaultCategoryId);
        }
    }
}
