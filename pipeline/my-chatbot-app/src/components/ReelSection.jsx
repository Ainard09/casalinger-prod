import ReelCard from './ReelCard';

const ReelSection = ({ reels = [] }) => {
  if (!reels.length) return null;
  return (
    <div className="w-full my-8">
      <h2 className="text-lg font-bold mb-3 text-gray-800 px-2 md:px-0">Recommended Reels</h2>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth py-2 px-1 md:px-4" style={{ scrollSnapType: 'x mandatory' }}>
        {reels.map((reel, i) => (
          <div
            key={i}
            className="flex-shrink-0 w-64 md:w-80 transition-transform duration-200 hover:scale-105 hover:shadow-lg cursor-pointer scroll-snap-align-start"
          >
            <ReelCard
              title={reel.title}
              location={reel.location}
              tags={reel.tags}
              videoUrl={reel.video_url}
              index={i}
              listingId={reel.listing_id}
              bedrooms={reel.bedrooms}
              listing_type={reel.listing_type}
              units={reel.units}
              bedroom_range={reel.bedroom_range}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReelSection; 