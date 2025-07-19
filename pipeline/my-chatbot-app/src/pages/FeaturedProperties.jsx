import React, { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import SearchForm from '../components/SearchForm';
import PropertyCard from '../components/PropertyCard';
import Footer from '../components/Footer';
import HeroBanner from '../components/HeroBanner';
import MegaCarousel from '../components/MegaCarousel';
import ReelSection from '../components/ReelSection';
import { useBreakpoint } from '../hooks/useBreakpoint';

const REEL_ROTATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
const REEL_DISPLAY_COUNT = 12;

function getRandomSubset(arr, n) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

const FeaturedProperties = () => {
  const { currentUser } = useContext(AuthContext);
  const [featured, setFeatured] = useState([]);
  const [promoted, setPromoted] = useState([]);
  const [newest, setNewest] = useState([]);
  const [randomOld, setRandomOld] = useState([]);
  const [listings, setListings] = useState([]);
  const [reels, setReels] = useState([]);
  const [displayedReels, setDisplayedReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savedListings, setSavedListings] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ current: 1, total: 1, hasPrev: false, hasNext: false });
  const [loadedReelSections, setLoadedReelSections] = useState({});
  const [searchMode, setSearchMode] = useState(false);
  const [searchLocation, setSearchLocation] = useState('');
  const breakpoint = useBreakpoint();
  const timerRef = useRef(null);

  const fetchHomepage = () => {
    setLoading(true);
    const locationParam = searchMode && searchLocation ? `&location=${encodeURIComponent(searchLocation)}` : '';
    axios.get(`http://127.0.0.1:5000/api/featured-properties?page=${page}${locationParam}${currentUser?.id ? `&user_id=${currentUser.id}` : ''}`)
      .then(res => {
        if (res.data.listings) {
          setListings(res.data.listings);
          setSavedListings(res.data.listings.filter(l => l.is_favorite).map(l => l.id));
          setPagination({
            current: res.data.page || 1,
            total: res.data.total_pages || 1,
            hasPrev: res.data.has_prev || false,
            hasNext: res.data.has_next || false,
          });
        } else {
          setListings([]);
          setSavedListings([]);
          setPagination({ current: 1, total: 1, hasPrev: false, hasNext: false });
        }
      })
      .catch(err => {
        console.error("Failed to load listings:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleSearch = (results) => {
    if (results.featured) {
      setFeatured(results.featured);
      setPromoted(results.promoted);
      setNewest(results.newest);
      setRandomOld(results.random_old);
      setListings([]);
    } else if (results.listings) {
      setListings(results.listings);
      setFeatured([]);
      setPromoted([]);
      setNewest([]);
      setRandomOld([]);
    } else {
      setListings(results);
      setFeatured([]);
      setPromoted([]);
      setNewest([]);
      setRandomOld([]);
    }
  };

  useEffect(() => {
    function handleHeroSearch(e) {
      const location = e.detail && typeof e.detail === 'string' ? e.detail : '';
      if (!location) return;
      setLoading(true);
      setSearchMode(true);
      setSearchLocation(location);
      setPagination({ current: 1, total: 1, hasPrev: false, hasNext: false });
      setPage(1);
      axios.get(`http://127.0.0.1:5000/api/featured-properties?page=1&location=${encodeURIComponent(location)}${currentUser?.id ? `&user_id=${currentUser.id}` : ''}`)
        .then(res => {
          setListings(res.data.listings || []);
          setPagination({
            current: res.data.page || 1,
            total: res.data.total_pages || 1,
            hasPrev: res.data.has_prev || false,
            hasNext: res.data.has_next || false,
          });
        })
        .catch(() => setListings([]))
        .finally(() => setLoading(false));
    }
    window.addEventListener('hero-search', handleHeroSearch);
    return () => window.removeEventListener('hero-search', handleHeroSearch);
  }, [currentUser]);

  useEffect(() => {
    if (!searchMode) fetchHomepage();
  }, [page, currentUser, searchMode]);

  const handleResetSearch = () => {
    setSearchMode(false);
    setSearchLocation('');
    fetchHomepage();
  };

  const setReelsInStorage = (reelsSubset) => {
    sessionStorage.setItem('displayedReels', JSON.stringify(reelsSubset));
    sessionStorage.setItem('reelsTimestamp', Date.now().toString());
  };

  const rotateReels = (all) => {
    const subset = getRandomSubset(all, REEL_DISPLAY_COUNT);
    setDisplayedReels(subset);
    setReelsInStorage(subset);
  };

  useEffect(() => {
    let ignore = false;
    if (currentUser?.id && !currentUser.is_agent) {
      axios.get(`http://127.0.0.1:5000/api/personalized-reels?user_id=${currentUser.id}`)
        .then(res => res.data.reels || [])
        .then(all => {
          if (ignore) return;
          setReels(all);
          const stored = sessionStorage.getItem('displayedReels');
          const timestamp = sessionStorage.getItem('reelsTimestamp');
          const now = Date.now();
          if (stored && timestamp && now - Number(timestamp) < REEL_ROTATE_INTERVAL) {
            setDisplayedReels(JSON.parse(stored));
            timerRef.current = setTimeout(() => rotateReels(all), REEL_ROTATE_INTERVAL - (now - Number(timestamp)));
          } else {
            rotateReels(all);
            timerRef.current = setTimeout(() => rotateReels(all), REEL_ROTATE_INTERVAL);
          }
        })
        .catch(() => setDisplayedReels([]));
    } else if (!currentUser) {
      axios.get('http://127.0.0.1:5000/api/user-reels')
        .then(res => res.data.reels || [])
        .then(all => {
          setReels(all);
          const stored = sessionStorage.getItem('displayedReels');
          const timestamp = sessionStorage.getItem('reelsTimestamp');
          const now = Date.now();
          if (stored && timestamp && now - Number(timestamp) < REEL_ROTATE_INTERVAL) {
            setDisplayedReels(JSON.parse(stored));
            timerRef.current = setTimeout(() => rotateReels(all), REEL_ROTATE_INTERVAL - (now - Number(timestamp)));
          } else {
            rotateReels(all);
            timerRef.current = setTimeout(() => rotateReels(all), REEL_ROTATE_INTERVAL);
          }
        })
        .catch(() => setDisplayedReels([]));
    } else {
      setReels([]);
      setDisplayedReels([]);
    }
    return () => {
      ignore = true;
      clearTimeout(timerRef.current);
    };
  }, [currentUser]);

  const toggleSave = (id) => {
    setSavedListings(prev => (
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    ));
  };

  const reelPlaceholders = useRef([]);
  useEffect(() => {
    if (!reelPlaceholders.current) return;
    const observer = new window.IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = Number(entry.target.dataset.idx);
          setLoadedReelSections(prev => ({ ...prev, [idx]: true }));
        }
      });
    }, { threshold: 0.2 });
    reelPlaceholders.current.forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [listings.length, breakpoint.chunk]);

  return (
    <>
      <HeroBanner />
      <div className="w-full min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto w-full px-4 py-8" id="search-section">
          <SearchForm onSearch={handleSearch} onReset={handleResetSearch} />
          {searchMode && (
            <div className="flex justify-end mb-4">
              <button onClick={handleResetSearch} className="px-4 py-2 bg-blue-100 text-blue-700 rounded shadow hover:bg-blue-200 transition">Reset Search</button>
            </div>
          )}
          {loading ? (
            <p className="text-center text-gray-600">Loading...</p>
          ) : (
            <div>
              <div className="mb-8">
                <h2 className="text-xl font-bold mb-2">Properties</h2>
                {(() => {
                  const chunkSize = 8;
                  const reelsPerSection = 5;
                  const listingsPerPage = 16;
                  const chunksPerPage = listingsPerPage / chunkSize;
                  const propertyChunks = [];
                  for (let i = 0; i < listings.length; i += chunkSize) {
                    propertyChunks.push(listings.slice(i, i + chunkSize));
                  }
                  return propertyChunks.map((chunk, idx) => {
                    const globalIdx = (page - 1) * chunksPerPage + idx;
                    const reelsForSection = displayedReels.slice(globalIdx * reelsPerSection, (globalIdx + 1) * reelsPerSection);
                    return (
                      <React.Fragment key={idx}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {chunk.map(property => (
                            <PropertyCard
                              key={property.id}
                              property={property}
                              savedListings={savedListings}
                              toggleSave={toggleSave}
                              currentUser={currentUser}
                            />
                          ))}
                        </div>
                        {((currentUser && !currentUser.is_agent) || !currentUser) && reelsForSection.length > 0 && (
                          <div className="col-span-full">
                            <ReelSection reels={reelsForSection} />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  });
                })()}
              </div>
              <div className="flex justify-center gap-4 mt-8">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={!pagination.hasPrev}
                  className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-gray-700 font-medium">
                  Page {pagination.current} of {pagination.total}
                </span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={!pagination.hasNext}
                  className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          <div className="mt-16">
            <MegaCarousel />
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default FeaturedProperties;



