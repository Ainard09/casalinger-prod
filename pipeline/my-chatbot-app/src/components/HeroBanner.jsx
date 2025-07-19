import { Search, Home } from 'lucide-react';

const HeroBanner = () => {
    const handleBrowseClick = () => {
        const el = document.getElementById('search-section');
        if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
        }
    };
    return (
        <section className="relative w-full min-h-[380px] md:min-h-[480px] flex items-center justify-center bg-cover bg-center" style={{ backgroundImage: "url('/banner.jpg')" }}>
            {/* Sharper, more professional gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a]/95 via-[#1e293b]/80 to-transparent" />
            <div className="relative z-10 w-full max-w-5xl mx-auto text-center px-4 py-16 md:py-24">
                <h1 className="text-4xl md:text-6xl font-extrabold mb-4 text-center drop-shadow-lg animate-fade-in-up font-sans" style={{ fontFamily: 'Urbanist, sans-serif' }}>
                    <span className="bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400 bg-clip-text text-transparent">
                        Find Your Dream Home
                    </span>
                    <span className="block text-white font-light mt-2">with CasaLinger</span>
                </h1>
                <p className="text-lg md:text-2xl mb-8 text-gray-200 font-sans" style={{ fontFamily: 'Urbanist, sans-serif' }}>
                    Buy, Rent and Shortlet Affordable Properties and Apartments with Smart AI across Nigeria — all in one place.
                </p>
                <button
                    onClick={handleBrowseClick}
                    className="mt-2 px-8 py-3 bg-gradient-to-r from-gray-700 via-gray-500 to-gray-700 bg-[length:200%_100%] bg-left animate-gradient-x text-white text-lg font-semibold rounded-full shadow flex items-center justify-center gap-2 transition"
                    style={{ backgroundSize: '200% 100%' }}
                >
                    <Search className="w-5 h-5 mr-1" />
                    Browse Properties
                </button>
            </div>
        </section>
    );
};

export default HeroBanner;



