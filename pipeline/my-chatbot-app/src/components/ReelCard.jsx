import { useState, useRef, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Video, Heart, Share, Volume2, VolumeX, Trash2, Expand } from 'lucide-react';
import { Button } from "../ui/Button";
import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '../utils/config';

function ReelCard({
    title,
    location,
    tags = [],
    videoUrl,
    index = 0,
    reelId,
    isAgent = false,
    onDelete,
    listingId,
    listing_type,
    bedroom_range,
    bedrooms
}) {
    const [muted, setMuted] = useState(true);
    const [loading, setLoading] = useState(false);
    const [hasPreviewed, setHasPreviewed] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showOverlay, setShowOverlay] = useState(true);
    const videoRef = useRef(null);
    const previewTimeout = useRef(null);
    const navigate = useNavigate();

    // 12s autoplay preview on mount
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play();
            previewTimeout.current = setTimeout(() => {
                videoRef.current.pause();
                setHasPreviewed(true);
            }, 12000);
        }
        return () => clearTimeout(previewTimeout.current);
    }, []);

    // Resume full playback on hover/tap (restart from beginning)
    const handleMouseEnter = () => {
        setIsHovered(true);
        setShowOverlay(false);
        if (videoRef.current && hasPreviewed) {
            videoRef.current.currentTime = 0;
            videoRef.current.play();
        }
    };
    const handleMouseLeave = () => {
        setIsHovered(false);
        if (videoRef.current && hasPreviewed && !isFullscreen) {
            videoRef.current.pause();
        }
    };
    // Mobile tap to play
    const handleTouchStart = () => {
        setIsHovered(true);
        setShowOverlay(false);
        if (videoRef.current && hasPreviewed) {
            videoRef.current.play();
        }
    };
    // Fullscreen logic
    const handleFullscreen = () => {
        if (videoRef.current && videoRef.current.requestFullscreen) {
            videoRef.current.requestFullscreen();
            setIsFullscreen(true);
            videoRef.current.play();
        }
    };
    // Exit fullscreen event and toggle class
    useEffect(() => {
        const onFullscreenChange = () => {
            const isNowFullscreen = !!document.fullscreenElement;
            setIsFullscreen(isNowFullscreen);
            if (videoRef.current) {
                if (isNowFullscreen) {
                    videoRef.current.classList.add('reelcard-fullscreen');
                } else {
                    videoRef.current.classList.remove('reelcard-fullscreen');
                    if (hasPreviewed) videoRef.current.pause();
                }
            }
        };
        document.addEventListener('fullscreenchange', onFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
    }, [hasPreviewed]);

    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted;
            setMuted(videoRef.current.muted);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this reel?")) return;
        setLoading(true);
        try {
            await axios.delete(`/api/reels/${reelId}`);
            onDelete?.(reelId);
        } catch (err) {
            console.error("Failed to delete reel:", err);
            alert("Error deleting reel.");
        } finally {
            setLoading(false);
        }
    };

    const randomTags = useMemo(() => {
        const shuffled = [...tags].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 3);
    }, [tags]);

    const handleViewDetails = async (e) => {
        e.preventDefault();
        try {
            await fetch(API_ENDPOINTS.INTERACTION, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    listing_id: listingId,
                    interaction_type: 'view',
                    user_id: null, // Optionally pass user id if available in props/context
                    title: title,
                    city: location?.split(',')[1]?.trim() || '',
                    state: location?.split(',')[2]?.trim() || '',
                    area: location?.split(',')[0]?.trim() || '',
                    tags: Array.isArray(tags) ? tags.join(',') : ''
                })
            });
        } catch (err) {
            // Optionally handle error
        }
        navigate(`/listing/${listingId}`);
    };

    return (
        <div className="relative group">
            <div
                className="relative h-[500px] rounded-xl overflow-hidden shadow-lg"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchStart}
            >
                <video
                    ref={videoRef}
                    src={videoUrl}
                    muted={muted}
                    playsInline
                    preload="none"
                    className={`absolute inset-0 w-full h-full object-cover ${isFullscreen ? 'reelcard-fullscreen' : ''}`}
                    tabIndex={0}
                    aria-label={title + ' video preview'}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent pointer-events-none"></div>
                {/* Overlay message */}
                {showOverlay && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-lg font-semibold transition-opacity duration-300 select-none pointer-events-none">
                        <span className="backdrop-blur-sm px-4 py-2 rounded-full bg-black/40">
                            {/* Removed: Hover to watch full video */}
                        </span>
                    </div>
                )}
                {/* 🎖️ Purple Complex Badge */}
                {listing_type === 'complex' && (
                    <div className="absolute top-4 left-4 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full z-10">
                        Complex
                    </div>
                )}
                {/* Video Controls */}
                <div className="absolute top-4 right-4 flex gap-2 z-10">
                    <div
                        onClick={toggleMute}
                        className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center cursor-pointer relative"
                        aria-label={muted ? 'Unmute video' : 'Mute video'}
                        role="button"
                        tabIndex={0}
                    >
                        {muted ? (
                            <VolumeX className="h-5 w-5 text-white" />
                        ) : (
                            <Volume2 className="h-5 w-5 text-white" />
                        )}
                    </div>
                    <div
                        onClick={handleFullscreen}
                        className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center cursor-pointer"
                        aria-label="Fullscreen video"
                        role="button"
                        tabIndex={0}
                    >
                        <Expand className="h-5 w-5 text-white" />
                    </div>
                    <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Video className="h-5 w-5 text-white" />
                    </div>
                </div>
                {/* Agent-only Delete */}
                {isAgent && (
                    <div className="absolute top-4 left-4 translate-x-14">
                        <button
                            onClick={handleDelete}
                            disabled={loading}
                            className="h-10 w-10 rounded-full bg-red-600/80 hover:bg-red-700/90 text-white flex items-center justify-center"
                            aria-label="Delete reel"
                        >
                            <Trash2 className="h-5 w-5" />
                        </button>
                    </div>
                )}
                {/* Bottom content */}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white font-semibold text-lg">{title}</h3>
                    {/* Location */}
                    <div className="flex items-center text-gray-300 text-sm mb-1">
                        <MapPin className="h-4 w-4 mr-1" />
                        <span>{location}</span>
                    </div>
                    {/* 🛏️ Bedroom info */}
                    {listing_type === 'complex' && bedroom_range && (
                        <div className="text-gray-300 text-xs mb-2 flex items-center gap-1">
                            <span role="img" aria-label="bed">🛏️</span>
                            <span>
                                {bedroom_range.includes('-')
                                    ? `${bedroom_range.replace('-', '–')} Bedrooms`
                                    : `${bedroom_range} Bedroom${bedroom_range !== '1' ? 's' : ''}`}
                            </span>
                        </div>
                    )}
                    {listing_type !== 'complex' && bedrooms && (
                        <div className="text-gray-300 text-xs mb-2 flex items-center gap-1">
                            <span role="img" aria-label="bed">🛏️</span>
                            <span>{bedrooms} Bedroom{bedrooms > 1 ? 's' : ''}</span>
                        </div>
                    )}
                    {/* 🏷️ Tags */}
                    <div className="flex flex-wrap gap-2 mb-3">
                        {randomTags.map((tag, i) => (
                            <span key={i} className="bg-white/20 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full">
                                {tag}
                            </span>
                        ))}
                    </div>
                    {/* CTA Buttons */}
                    <div className="flex justify-between items-center">
                        <Link to={`/listing/${listingId}`}>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-gray-100 border border-white/30 hover:bg-white/10"
                                onClick={handleViewDetails}
                            >
                                View Details
                            </Button>
                        </Link>
                        <div className="flex gap-2">
                            <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                <Heart className="h-4 w-4 text-white" />
                            </div>
                            <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                <Share className="h-4 w-4 text-white" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Add global style for fullscreen video
// In your CSS (e.g., index.css or a global stylesheet):
// .reelcard-fullscreen {
//   width: 100vw !important;
//   height: 100vh !important;
//   object-fit: contain !important;
//   background: black;
//   position: fixed !important;
//   top: 0; left: 0;
//   z-index: 9999;
// }

export default ReelCard;