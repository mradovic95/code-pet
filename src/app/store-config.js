'use strict';

/**
 * LemonSqueezy store configuration.
 *
 * Setup:
 * 1. Create a LemonSqueezy account at https://lemonsqueezy.com
 * 2. Create a product for each premium pet (enable "License keys" under product settings)
 * 3. Set activation limit to 3 (or your preference)
 * 4. Fill in the products map below: LemonSqueezy product ID → pet config
 * 5. Host premium pet sprite files and set spriteBaseUrl per product
 *
 * Each entry maps a LemonSqueezy numeric product ID to a Code Pet pet ID.
 */

const products = {
  // Example — uncomment and fill in with your LemonSqueezy product details:
  //
  // 123456: {
  //   petId: 'dragon',
  //   name: 'Dragon',
  //   description: 'A fiery coding dragon',
  //   price: '$2.99',
  //   checkoutUrl: 'https://your-store.lemonsqueezy.com/buy/xxxxxxxx',
  //   spriteBaseUrl: 'https://your-cdn.com/pets/dragon',
  // },
  // 789012: {
  //   petId: 'panda-premium',
  //   name: 'Panda',
  //   description: 'A zen coding panda',
  //   price: '$2.99',
  //   checkoutUrl: 'https://your-store.lemonsqueezy.com/buy/yyyyyyyy',
  //   spriteBaseUrl: 'https://your-cdn.com/pets/panda-premium',
  // },
};

function getByPetId(petId) {
  for (const product of Object.values(products)) {
    if (product.petId === petId) return product;
  }
  return null;
}

function getByProductId(productId) {
  return products[productId] || null;
}

function getCatalog() {
  return Object.entries(products).map(([productId, product]) => ({
    id: product.petId,
    name: product.name,
    description: product.description,
    price: product.price,
    tier: 'premium',
    checkoutUrl: product.checkoutUrl,
    productId: Number(productId),
  }));
}

module.exports = { products, getByPetId, getByProductId, getCatalog };
