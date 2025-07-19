import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const PasswordInput = ({ 
    value, 
    onChange, 
    placeholder = "Password", 
    required = false, 
    autoComplete = "current-password",
    className = "",
    label = "Password"
}) => {
    const [showPassword, setShowPassword] = useState(false);

    const togglePasswordVisibility = () => {
        setShowPassword(!showPassword);
    };

    return (
        <div>
            <label className="block font-semibold mb-1">{label}</label>
            <div className="relative">
                <input
                    type={showPassword ? "text" : "password"}
                    className={`w-full border rounded p-2 pr-10 ${className}`}
                    value={value}
                    onChange={onChange}
                    required={required}
                    autoComplete={autoComplete}
                    placeholder={placeholder}
                />
                <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors focus:outline-none focus:ring-0 focus:border-0 active:outline-none active:ring-0 active:border-0 bg-transparent"
                    style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                >
                    {showPassword ? (
                        <EyeOff size={18} />
                    ) : (
                        <Eye size={18} />
                    )}
                </button>
            </div>
        </div>
    );
};

export default PasswordInput; 