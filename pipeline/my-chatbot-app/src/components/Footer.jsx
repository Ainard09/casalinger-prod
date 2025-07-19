import { Facebook, Twitter, Instagram, Linkedin } from 'lucide-react';

const FooterLink = ({ href, children }) => (
    <li>
        <a href={href} className="text-gray-400 hover:text-white transition-colors duration-200">
            {children}
        </a>
    </li>
);

const SocialIcon = ({ href, icon: Icon }) => (
    <a href={href} className="text-gray-400 hover:text-white transition-colors duration-200">
        <Icon className="w-6 h-6" />
    </a>
);

const Footer = () => {
    return (
        <footer className="bg-gray-900 text-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                    {/* Column 1: Get Started */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold tracking-wider uppercase">Get Started</h3>
                        <ul className="space-y-3">
                            <FooterLink href="/register">Create Account</FooterLink>
                            <FooterLink href="/login">Sign In</FooterLink>
                            <FooterLink href="/agent/login">Post a Listing</FooterLink>
                            <FooterLink href="/agents">Find an Agent</FooterLink>
                        </ul>
                    </div>

                    {/* Column 2: About CasaLinger */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold tracking-wider uppercase">About CasaLinger</h3>
                        <ul className="space-y-3">
                            <FooterLink href="#">About Us</FooterLink>
                            <FooterLink href="#">Careers</FooterLink>
                            <FooterLink href="#">Press</FooterLink>
                            <FooterLink href="#">Blog</FooterLink>
                        </ul>
                    </div>

                    {/* Column 3: Support */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold tracking-wider uppercase">Support</h3>
                        <ul className="space-y-3">
                            <FooterLink href="#">Help Center</FooterLink>
                            <FooterLink href="#">Contact Us</FooterLink>
                            <FooterLink href="#">FAQs</FooterLink>
                        </ul>
                    </div>

                    {/* Column 4: Legal */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold tracking-wider uppercase">Legal</h3>
                        <ul className="space-y-3">
                            <FooterLink href="#">Terms of Use</FooterLink>
                            <FooterLink href="#">Privacy Policy</FooterLink>
                            <FooterLink href="#">Accessibility</FooterLink>
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center">
                    <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} CasaLinger. All rights reserved.</p>
                    <div className="flex space-x-6 mt-4 sm:mt-0">
                        <SocialIcon href="#" icon={Twitter} />
                        <SocialIcon href="#" icon={Facebook} />
                        <SocialIcon href="#" icon={Instagram} />
                        <SocialIcon href="#" icon={Linkedin} />
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;



