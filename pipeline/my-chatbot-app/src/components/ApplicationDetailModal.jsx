import React from 'react';
import { FiX, FiCheck, FiUser, FiMail, FiPhone, FiDollarSign, FiCalendar, FiMapPin, FiFileText } from 'react-icons/fi';

const ApplicationDetailModal = ({ application, isOpen, onClose, onUpdateStatus }) => {
    if (!isOpen || !application) return null;

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'long', 
            day: 'numeric', 
            year: 'numeric'
        });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            case 'approved': return 'bg-green-100 text-green-800';
            case 'rejected': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">Application Details</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <FiX className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Status Badge */}
                    <div className="flex items-center justify-between">
                        <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(application.status)}`}>
                            {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
                        </span>
                        <span className="text-sm text-gray-500">
                            Applied: {formatDate(application.created_at)}
                        </span>
                    </div>

                    {/* Property Information */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                            <FiMapPin className="mr-2" />
                            Property Details
                        </h3>
                        <div className="space-y-2">
                            <p className="text-gray-900 font-medium">{application.property_title}</p>
                            <p className="text-gray-600">{application.property_location}</p>
                        </div>
                    </div>

                    {/* Applicant Information */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                            <FiUser className="mr-2" />
                            Applicant Information
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Full Name</label>
                                <p className="text-gray-900">{application.applicant_name}</p>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center">
                                    <FiMail className="mr-1" />
                                    Email
                                </label>
                                <p className="text-gray-900">{application.applicant_email}</p>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center">
                                    <FiPhone className="mr-1" />
                                    Phone
                                </label>
                                <p className="text-gray-900">{application.applicant_phone}</p>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center">
                                    <FiDollarSign className="mr-1" />
                                    Monthly Income
                                </label>
                                <p className="text-gray-900">₦{application.monthly_income?.toLocaleString() || 'N/A'}</p>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Employment Status</label>
                                <p className="text-gray-900">{application.employment_status}</p>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center">
                                    <FiCalendar className="mr-1" />
                                    Move-in Date
                                </label>
                                <p className="text-gray-900">{formatDate(application.move_in_date)}</p>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Lease Duration</label>
                                <p className="text-gray-900">{application.lease_duration} months</p>
                            </div>
                        </div>
                    </div>

                    {/* Additional Notes */}
                    {application.additional_notes && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 flex items-center">
                                <FiFileText className="mr-1" />
                                Additional Notes
                            </label>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-900 whitespace-pre-wrap">{application.additional_notes}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions */}
                {application.status === 'pending' && (
                    <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
                        <button
                            onClick={() => onUpdateStatus(application.application_id, 'rejected')}
                            className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
                        >
                            <FiX className="inline mr-2" />
                            Reject Application
                        </button>
                        <button
                            onClick={() => onUpdateStatus(application.application_id, 'approved')}
                            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
                        >
                            <FiCheck className="inline mr-2" />
                            Approve Application
                        </button>
                    </div>
                )}

                {application.status !== 'pending' && (
                    <div className="flex items-center justify-end p-6 border-t border-gray-200">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ApplicationDetailModal; 