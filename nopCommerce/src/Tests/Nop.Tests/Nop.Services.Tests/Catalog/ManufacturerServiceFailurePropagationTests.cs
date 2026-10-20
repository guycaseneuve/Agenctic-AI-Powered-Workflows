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
    [Test]
    public void GetManufacturersByCategoryIdAsync_DevelopmentFaultEnabled_ThrowsAndStopsDependentWork()
    {
        const int categoryId = 12;
        var customer = new Customer();
        var store = new Store { Id = 3 };

        var catalogSettings = new CatalogSettings { ShowProductsFromSubcategories = true };
        var aclService = new Mock<IAclService>();
        var categoryService = new Mock<ICategoryService>();
        var customerService = new Mock<ICustomerService>();
        var manufacturerRepository = new Mock<IRepository<Manufacturer>>();
        var productCategoryRepository = new Mock<IRepository<ProductCategory>>();
        var productRepository = new Mock<IRepository<Product>>();
        var storeContext = new Mock<IStoreContext>();
        var storeMappingService = new Mock<IStoreMappingService>();
        var workContext = new Mock<IWorkContext>();
        var staticCacheManager = new Mock<IStaticCacheManager>();

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
            .Returns(Array.Empty<Product>().AsQueryable());
        storeMappingService
            .Setup(service => service.ApplyStoreMapping(It.IsAny<IQueryable<Product>>(), store.Id))
            .Returns((IQueryable<Product> query, int _) => Task.FromResult(query));
        aclService
            .Setup(service => service.ApplyAcl(It.IsAny<IQueryable<Product>>(), It.IsAny<int[]>()))
            .Returns((IQueryable<Product> query, int[] _) => Task.FromResult(query));

        var service = new ManufacturerService(
            catalogSettings,
            aclService.Object,
            categoryService.Object,
            customerService.Object,
            new Mock<IRepository<DiscountManufacturerMapping>>().Object,
            manufacturerRepository.Object,
            productRepository.Object,
            new Mock<IRepository<ProductManufacturer>>().Object,
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

            var thrown = Assert.ThrowsAsync<InvalidOperationException>(
                async () => await service.GetManufacturersByCategoryIdAsync(categoryId));

            thrown.Message.Should().Contain("Catalog fault injection triggered");
            categoryService.Verify(
                dependency => dependency.GetChildCategoryIdsAsync(categoryId, store.Id, false),
                Times.Never);
            productCategoryRepository.VerifyGet(repository => repository.Table, Times.Never);
            manufacturerRepository.VerifyGet(repository => repository.Table, Times.Never);
            staticCacheManager.Verify(
                cache => cache.GetAsync(
                    It.IsAny<CacheKey>(),
                    It.IsAny<Func<Task<IList<Manufacturer>>>>()),
                Times.Never);
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
