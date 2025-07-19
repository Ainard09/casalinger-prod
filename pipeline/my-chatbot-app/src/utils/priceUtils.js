/**
 * Calculate price range for a property listing
 * @param {Object} listing - The listing object
 * @param {string} rentPeriod - The rent period ('year' or 'month')
 * @returns {string} Formatted price range
 */
export const calculatePriceRange = (listing, rentPeriod = 'year') => {
  if (!listing) return '₦0/year';
  
  const rentPeriodAbbr = rentPeriod === 'year' ? '/yr' : '/mo';
  
  // For individual listings, return simple price
  if (listing.listing_type !== 'complex' || !listing.units || listing.units.length === 0) {
    return `₦${listing.price?.toLocaleString() || 0}${rentPeriodAbbr}`;
  }

  // For complex listings, calculate from units
  const parents = listing.units.filter(u => !u.name.includes(' - '));
  const children = listing.units.filter(u => u.name.includes(' - '));

  const floorplanMap = {};
  parents.forEach(p => {
    floorplanMap[p.name] = {
      ...p,
      child_units: children
        .filter(c => c.name.startsWith(`${p.name} - `))
        .map(c => ({ ...c, name: c.name.split(' - ')[1] }))
    };
  });

  const allUnits = Object.values(floorplanMap);
  const allPrices = allUnits.flatMap(u => [u.price_min, u.price_max]).filter(p => p > 0);

  if (allPrices.length === 0) {
    return `₦0${rentPeriodAbbr}`;
  }

  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  
  const priceRange = minPrice === maxPrice 
    ? `₦${minPrice.toLocaleString()}` 
    : `₦${minPrice.toLocaleString()} - ₦${maxPrice.toLocaleString()}`;
    
  return priceRange + rentPeriodAbbr;
}; 