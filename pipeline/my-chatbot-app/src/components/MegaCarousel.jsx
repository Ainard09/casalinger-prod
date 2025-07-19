import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, EffectFade, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/effect-fade';
import 'swiper/css/navigation';
import { ChevronLeft, ChevronRight, MapPin, Home, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

const slides = [
    {
        image: '/carousel/lagos.jpg',
        title: "Discover Your Dream Home in Lagos",
        subtitle: "Lagos is home to over 2 million industrious people who deserve transparency and fast access to affordable homes.",
        cta: "Explore Properties",
        link: "/",
        icon: <MapPin className="w-6 h-6" />
    },
    {
        image: '/carousel/ai-community.jpg',
        title: "AI-Powered Real Estate",
        subtitle: "AI-powered community helping you find your dream home with smart insights and recommendations.",
        cta: "Learn More",
        link: "/community",
        icon: <Search className="w-6 h-6" />
    },
    {
        image: '/carousel/cozy.jpg',
        title: "Curated for Your Lifestyle",
        subtitle: "Discover cozy apartments, smart homes, and more — curated to fit your lifestyle and budget.",
        cta: "Start Searching",
        link: "/",
        icon: <Home className="w-6 h-6" />
    },
];

const MegaCarousel = () => {
    return (
        <div className="w-full px-4 md:px-8 lg:px-16 mb-16">
            <div className="relative">
                {/* Section Header */}
                <div className="text-center mb-8">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
                        Discover Your Perfect Home
                    </h2>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                        Explore our curated collection of premium properties across Nigeria
                    </p>
                </div>

                {/* Carousel Container */}
                <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                    <Swiper
                        modules={[Autoplay, Pagination, Navigation]}
                        autoplay={{ 
                            delay: 4000,
                            disableOnInteraction: false,
                            pauseOnMouseEnter: true
                        }}
                        pagination={{ 
                            clickable: true,
                            dynamicBullets: true,
                            renderBullet: function (index, className) {
                                return '<span class="' + className + ' bg-white opacity-60 hover:opacity-100 transition-opacity"></span>';
                            }
                        }}
                        navigation={{
                            nextEl: '.swiper-button-next',
                            prevEl: '.swiper-button-prev',
                        }}
                        loop={true}
                        speed={800}
                        className="w-full"
                    >
                        {slides.map((slide, index) => (
                            <SwiperSlide key={index}>
                                <div className="relative h-[400px] md:h-[500px] lg:h-[600px]">
                                    {/* Background Image */}
                                    <img
                                        src={slide.image}
                                        alt={`Slide ${index + 1}`}
                                        className="w-full h-full object-cover"
                                    />
                                    
                                    {/* Gradient Overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-transparent"></div>
                                    
                                    {/* Content Overlay */}
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="max-w-4xl mx-auto px-6 md:px-12 lg:px-16">
                                            <div className="max-w-2xl">
                                                {/* Icon */}
                                                <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full mb-6 border border-white/30">
                                                    <div className="text-white">
                                                        {slide.icon}
                                                    </div>
                                                </div>
                                                
                                                {/* Title */}
                                                <h3 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
                                                    {slide.title}
                                                </h3>
                                                
                                                {/* Subtitle */}
                                                <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed max-w-xl">
                                                    {slide.subtitle}
                                                </p>
                                                
                                                {/* CTA Button */}
                                                <Link
                                                    to={slide.link}
                                                    className="inline-flex items-center gap-2 bg-white text-gray-900 px-8 py-4 rounded-full font-semibold text-lg hover:bg-gray-100 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                                                >
                                                    {slide.cta}
                                                    <ChevronRight className="w-5 h-5" />
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </SwiperSlide>
                        ))}
                    </Swiper>
                    
                    {/* Custom Navigation Buttons */}
                    <div className="swiper-button-prev absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30 hover:bg-white/30 transition-all duration-300">
                        <ChevronLeft className="w-6 h-6 text-white" />
                    </div>
                    <div className="swiper-button-next absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30 hover:bg-white/30 transition-all duration-300">
                        <ChevronRight className="w-6 h-6 text-white" />
                    </div>
                </div>

                {/* Bottom Stats */}
                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center p-6 bg-white rounded-xl shadow-lg border border-gray-100">
                        <div className="text-3xl font-bold text-blue-600 mb-2">10,000+</div>
                        <div className="text-gray-600">Properties Available</div>
                    </div>
                    <div className="text-center p-6 bg-white rounded-xl shadow-lg border border-gray-100">
                        <div className="text-3xl font-bold text-blue-600 mb-2">50+</div>
                        <div className="text-gray-600">Cities Covered</div>
                    </div>
                    <div className="text-center p-6 bg-white rounded-xl shadow-lg border border-gray-100">
                        <div className="text-3xl font-bold text-blue-600 mb-2">24/7</div>
                        <div className="text-gray-600">Customer Support</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MegaCarousel;


