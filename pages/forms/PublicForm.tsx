import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';

const PublicForm: React.FC = () => {
    const { formId } = useParams<{ formId: string }>();

    const [form, setForm] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        fetchForm();
    }, [formId]);

    const fetchForm = async () => {
        try {
            const response = await fetch(
                `/api/vault?resource=tools&subResource=public-form&id=${encodeURIComponent(formId || '')}`
            );
            const data = await response.json();
            if (!data.ok) {
                setError('Form not found or not active');
            } else {
                const currentForm = data.form;
                if (currentForm && currentForm.status === 'Active') {
                    setForm(currentForm);
                    // Initialize form data
                    const initialData: Record<string, any> = {};
                    currentForm.fields?.forEach((field: any) => {
                        initialData[field.name] = field.type === 'checkbox' ? false : '';
                    });
                    setFormData(initialData);
                } else {
                    setError('Form not found or not active');
                }
            }
        } catch (err) {
            setError('Failed to load form');
        } finally {
            setLoading(false);
        }
    };

    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};

        form.fields?.forEach((field: any) => {
            if (field.required) {
                const value = formData[field.name];
                if (!value || (typeof value === 'string' && !value.trim())) {
                    errors[field.name] = `${field.label} is required`;
                }
            }

            // Email validation
            if (field.type === 'email' && formData[field.name]) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(formData[field.name])) {
                    errors[field.name] = 'Please enter a valid email address';
                }
            }
        });

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        try {
            setSubmitting(true);
            const response = await fetch('/api/vault?resource=tools&subResource=public-submission', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    formId: formId,
                    submissionData: formData,
                })
            });

            const data = await response.json();
            if (data.ok) {
                setSubmitted(true);
                setFormData({});
            } else {
                setError(data.error || 'Failed to submit form');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to submit form');
        } finally {
            setSubmitting(false);
        }
    };

    const handleFieldChange = (fieldName: string, value: any) => {
        setFormData({ ...formData, [fieldName]: value });
        // Clear validation error when user starts typing
        if (validationErrors[fieldName]) {
            setValidationErrors({ ...validationErrors, [fieldName]: '' });
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <Loader className="w-8 h-8 text-burgundy animate-spin mx-auto mb-4" />
                    <p className="text-gray-600">Loading form...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
                    <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-black text-[#0d1a14] mb-2">Form Unavailable</h2>
                    <p className="text-gray-600">{error}</p>
                </div>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-black text-[#0d1a14] mb-2">Thank You!</h2>
                    <p className="text-gray-600 mb-6">
                        {form.settings?.successMessage || 'Your response has been submitted successfully.'}
                    </p>
                    <button
                        onClick={() => {
                            setSubmitted(false);
                            const initialData: Record<string, any> = {};
                            form.fields?.forEach((field: any) => {
                                initialData[field.name] = field.type === 'checkbox' ? false : '';
                            });
                            setFormData(initialData);
                        }}
                        className="px-6 py-3 bg-burgundy text-gold font-bold rounded-xl hover:bg-burgundy-dark transition-colors"
                    >
                        Submit Another Response
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-6">
            <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
                    {/* Form Header */}
                    <div className="mb-8">
                        <h1 className="text-3xl font-black text-[#0d1a14] mb-2">{form.title}</h1>
                        {form.description && (
                            <p className="text-gray-600">{form.description}</p>
                        )}
                        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                            <span className="px-3 py-1 bg-gold-cream rounded-full text-gold font-bold text-xs uppercase">
                                {form.type}
                            </span>
                            <span>•</span>
                            <span>{form.fields?.length || 0} questions</span>
                        </div>
                    </div>

                    {/* Form Fields */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {form.fields?.map((field: any, index: number) => (
                            <div key={field.id || index}>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    {field.label}
                                    {field.required && <span className="text-red-500 ml-1">*</span>}
                                </label>

                                {field.type === 'textarea' ? (
                                    <textarea
                                        value={formData[field.name] || ''}
                                        onChange={(e) => handleFieldChange(field.name, e.target.value)}
                                        placeholder={field.placeholder}
                                        className={`w-full px-4 py-3 border rounded-xl focus:outline-none transition-colors ${validationErrors[field.name]
                                            ? 'border-red-500 focus:border-red-500'
                                            : 'border-gray-200 focus:border-gold'
                                            }`}
                                        rows={4}
                                    />
                                ) : field.type === 'select' ? (
                                    <select
                                        value={formData[field.name] || ''}
                                        onChange={(e) => handleFieldChange(field.name, e.target.value)}
                                        className={`w-full px-4 py-3 border rounded-xl focus:outline-none transition-colors ${validationErrors[field.name]
                                            ? 'border-red-500 focus:border-red-500'
                                            : 'border-gray-200 focus:border-gold'
                                            }`}
                                    >
                                        <option value="">Select an option...</option>
                                        {field.options?.map((opt: string, i: number) => (
                                            <option key={i} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                ) : field.type === 'checkbox' ? (
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            checked={formData[field.name] || false}
                                            onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                                            className="w-5 h-5 text-burgundy rounded focus:ring-gold"
                                        />
                                        <span className="text-sm text-gray-600">
                                            {field.placeholder || 'Check this box'}
                                        </span>
                                    </div>
                                ) : (
                                    <input
                                        type={field.type}
                                        value={formData[field.name] || ''}
                                        onChange={(e) => handleFieldChange(field.name, e.target.value)}
                                        placeholder={field.placeholder}
                                        className={`w-full px-4 py-3 border rounded-xl focus:outline-none transition-colors ${validationErrors[field.name]
                                            ? 'border-red-500 focus:border-red-500'
                                            : 'border-gray-200 focus:border-gold'
                                            }`}
                                    />
                                )}

                                {validationErrors[field.name] && (
                                    <p className="mt-1 text-sm text-red-500">{validationErrors[field.name]}</p>
                                )}
                            </div>
                        ))}

                        {form.fields?.length === 0 && (
                            <div className="text-center py-8 text-gray-400">
                                <p>This form has no fields yet.</p>
                            </div>
                        )}

                        {form.fields?.length > 0 && (
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full py-4 bg-burgundy text-gold font-black rounded-xl hover:bg-burgundy-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? 'Submitting...' : 'Submit Form'}
                            </button>
                        )}
                    </form>
                </div>

                {/* Footer */}
                <div className="mt-6 text-center text-sm text-gray-500">
                    <p>Powered by PLCC Admin</p>
                </div>
            </div>
        </div>
    );
};

export default PublicForm;
