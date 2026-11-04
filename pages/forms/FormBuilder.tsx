import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useNav } from '../../App';
import { canPerform } from '../../lib/permissions';
import {
    Plus,
    Trash2,
    GripVertical,
    Save,
    Eye,
    ArrowLeft,
    Type,
    Mail,
    Hash,
    AlignLeft,
    CheckSquare,
    List
} from 'lucide-react';

import { authedFetch } from '../../lib/authedFetch';
interface FormField {
    id: string;
    name: string;
    type: 'text' | 'email' | 'number' | 'textarea' | 'checkbox' | 'select';
    label: string;
    placeholder?: string;
    required: boolean;
    options?: string[];
}

const FormBuilder: React.FC = () => {
    const { formId } = useParams<{ formId: string }>();
    const navigate = useNavigate();
    const { userRole } = useNav(); // Assuming useNav is available or imported

    const [form, setForm] = useState<any>(null);
    const [fields, setFields] = useState<FormField[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        // Security check
        if (userRole && !canPerform(userRole, 'people.edit')) {
            navigate('/elements/forms');
            return;
        }
        fetchForm();
    }, [formId, userRole]);

    const fetchForm = async () => {
        try {
            const response = await authedFetch(`/api/vault?resource=tools&subResource=forms`);
            const data = await response.json();
            if (data.ok) {
                const currentForm = data.forms.find((f: any) => f.id === formId);
                if (currentForm) {
                    setForm(currentForm);
                    setFields(currentForm.fields || []);
                }
            }
        } catch (err) {
            console.error('Failed to load form', err);
        } finally {
            setLoading(false);
        }
    };

    const addField = (type: FormField['type']) => {
        const newField: FormField = {
            id: `field_${Date.now()}`,
            name: `field_${fields.length + 1}`,
            type,
            label: `New ${type} field`,
            placeholder: '',
            required: false,
            options: type === 'select' ? ['Option 1', 'Option 2'] : undefined
        };
        setFields([...fields, newField]);
    };

    const updateField = (id: string, updates: Partial<FormField>) => {
        setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const deleteField = (id: string) => {
        setFields(fields.filter(f => f.id !== id));
    };

    const moveField = (index: number, direction: 'up' | 'down') => {
        const newFields = [...fields];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= fields.length) return;
        [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
        setFields(newFields);
    };

    const saveForm = async () => {
        try {
            setSaving(true);
            const response = await authedFetch('/api/vault?resource=tools&subResource=forms', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: formId,
                    fields: fields,
                    title: form.title,
                    description: form.description,
                    status: form.status,
                    type: form.type
                })
            });

            console.log('[FormBuilder] Save response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[FormBuilder] API Error Response:', errorText);
                try {
                    const errorData = JSON.parse(errorText);
                    alert(`Save failed: ${errorData.error || errorData.message || 'Unknown error'}\n\nDetails: ${JSON.stringify(errorData, null, 2)}`);
                } catch {
                    alert(`Save failed with status ${response.status}\n\nResponse: ${errorText}`);
                }
                return;
            }

            const data = await response.json();
            console.log('[FormBuilder] Save response data:', data);

            if (data.ok) {
                alert('Form saved successfully!');
            } else {
                alert(data.error || 'Failed to save form');
            }
        } catch (err: any) {
            console.error('[FormBuilder] Save error:', err);
            alert(`Error: ${err.message || 'Failed to save form'}\n\nCheck console for details`);
        } finally {
            setSaving(false);
        }
    };

    const getFieldIcon = (type: string) => {
        switch (type) {
            case 'text': return <Type size={18} />;
            case 'email': return <Mail size={18} />;
            case 'number': return <Hash size={18} />;
            case 'textarea': return <AlignLeft size={18} />;
            case 'checkbox': return <CheckSquare size={18} />;
            case 'select': return <List size={18} />;
            default: return <Type size={18} />;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!form) {
        return (
            <div className="p-8">
                <p className="text-red-500">Form not found</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                            <button
                                onClick={() => navigate('/elements/forms')}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <div className="flex-1 max-w-2xl">
                                <input
                                    type="text"
                                    value={form?.title || ''}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    className="text-2xl font-black text-[#0d1a14] bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-gold focus:outline-none w-full transition-colors mb-1 placeholder-gray-300"
                                    placeholder="Untitled Form"
                                />
                                <div className="flex items-center gap-3">
                                    <select
                                        value={form?.status || 'Draft'}
                                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                                        className={`text-xs font-bold uppercase tracking-widest px-2 py-1 rounded-md border-none focus:ring-0 cursor-pointer ${form?.status === 'Active' ? 'bg-gold-cream text-gold' : 'bg-gray-100 text-gray-400'
                                            }`}
                                    >
                                        <option value="Draft">Draft</option>
                                        <option value="Active">Active</option>
                                        <option value="Archived">Archived</option>
                                    </select>
                                    <select
                                        value={form?.type || 'Other'}
                                        onChange={(e) => setForm({ ...form, type: e.target.value })}
                                        className="text-xs font-bold uppercase tracking-widest text-gray-400 bg-transparent border-none focus:ring-0 cursor-pointer hover:text-gray-600"
                                    >
                                        <option value="Registration">Registration</option>
                                        <option value="Spiritual">Spiritual</option>
                                        <option value="Service">Service</option>
                                        <option value="Giving">Giving</option>
                                        <option value="Feedback">Feedback</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowPreview(!showPreview)}
                                className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-bold text-sm"
                            >
                                <Eye size={18} />
                                {showPreview ? 'Edit' : 'Preview'}
                            </button>
                            <button
                                onClick={saveForm}
                                disabled={saving}
                                className="flex items-center gap-2 px-6 py-2 bg-burgundy text-gold rounded-xl hover:bg-burgundy-dark transition-colors font-bold text-sm disabled:opacity-50"
                            >
                                <Save size={18} />
                                {saving ? 'Saving...' : 'Save Form'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Field Types Sidebar */}
                    {!showPreview && (
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-2xl border border-gray-200 p-6 sticky top-24">
                                <h3 className="font-black text-[#0d1a14] mb-4">Add Fields</h3>
                                <div className="space-y-2">
                                    {[
                                        { type: 'text' as const, label: 'Text Input', icon: <Type size={16} /> },
                                        { type: 'email' as const, label: 'Email', icon: <Mail size={16} /> },
                                        { type: 'number' as const, label: 'Number', icon: <Hash size={16} /> },
                                        { type: 'textarea' as const, label: 'Long Text', icon: <AlignLeft size={16} /> },
                                        { type: 'checkbox' as const, label: 'Checkbox', icon: <CheckSquare size={16} /> },
                                        { type: 'select' as const, label: 'Dropdown', icon: <List size={16} /> }
                                    ].map(({ type, label, icon }) => (
                                        <button
                                            key={type}
                                            onClick={() => addField(type)}
                                            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gold-cream rounded-xl transition-colors text-left font-semibold text-sm"
                                        >
                                            {icon}
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Form Builder / Preview */}
                    <div className={showPreview ? 'lg:col-span-4' : 'lg:col-span-3'}>
                        <div className="bg-white rounded-2xl border border-gray-200 p-8">
                            {showPreview ? (
                                /* Preview Mode */
                                <div className="max-w-2xl mx-auto">
                                    <h2 className="text-3xl font-black text-[#0d1a14] mb-2">{form.title}</h2>
                                    {form.description && (
                                        <p className="text-gray-600 mb-8">{form.description}</p>
                                    )}

                                    <div className="space-y-6">
                                        {fields.map((field) => (
                                            <div key={field.id}>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                                    {field.label}
                                                    {field.required && <span className="text-red-500 ml-1">*</span>}
                                                </label>

                                                {field.type === 'textarea' ? (
                                                    <textarea
                                                        placeholder={field.placeholder}
                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-gold focus:outline-none"
                                                        rows={4}
                                                    />
                                                ) : field.type === 'select' ? (
                                                    <select className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-gold focus:outline-none">
                                                        <option value="">Select an option...</option>
                                                        {field.options?.map((opt, i) => (
                                                            <option key={i} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                ) : field.type === 'checkbox' ? (
                                                    <div className="flex items-center gap-2">
                                                        <input type="checkbox" className="w-5 h-5 text-burgundy" />
                                                        <span className="text-sm text-gray-600">{field.placeholder || 'Check this box'}</span>
                                                    </div>
                                                ) : (
                                                    <input
                                                        type={field.type}
                                                        placeholder={field.placeholder}
                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-gold focus:outline-none"
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {fields.length === 0 && (
                                        <div className="text-center py-12 text-gray-400">
                                            <p>No fields added yet. Click "Edit" to add fields to your form.</p>
                                        </div>
                                    )}

                                    {fields.length > 0 && (
                                        <button className="mt-8 w-full py-4 bg-burgundy text-gold font-black rounded-xl hover:bg-burgundy-dark transition-colors">
                                            Submit Form
                                        </button>
                                    )}
                                </div>
                            ) : (
                                /* Edit Mode */
                                <div className="space-y-4">
                                    {fields.length === 0 ? (
                                        <div className="text-center py-12 text-gray-400">
                                            <p className="font-semibold mb-2">No fields yet</p>
                                            <p className="text-sm">Add fields from the sidebar to build your form</p>
                                        </div>
                                    ) : (
                                        fields.map((field, index) => (
                                            <div key={field.id} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                                                <div className="flex items-start gap-4">
                                                    {/* Drag Handle */}
                                                    <div className="flex flex-col gap-1 pt-2">
                                                        <button
                                                            onClick={() => moveField(index, 'up')}
                                                            disabled={index === 0}
                                                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                                        >
                                                            <GripVertical size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => moveField(index, 'down')}
                                                            disabled={index === fields.length - 1}
                                                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                                        >
                                                            <GripVertical size={16} />
                                                        </button>
                                                    </div>

                                                    {/* Field Content */}
                                                    <div className="flex-1 space-y-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-burgundy border border-gray-200">
                                                                {getFieldIcon(field.type)}
                                                            </div>
                                                            <div className="flex-1">
                                                                <input
                                                                    type="text"
                                                                    value={field.label}
                                                                    onChange={(e) => updateField(field.id, { label: e.target.value })}
                                                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg font-semibold focus:border-gold focus:outline-none"
                                                                    placeholder="Field label"
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => deleteField(field.id)}
                                                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-4">
                                                            <input
                                                                type="text"
                                                                value={field.placeholder || ''}
                                                                onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                                                                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-gold focus:outline-none"
                                                                placeholder="Placeholder text"
                                                            />
                                                            <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-white transition-colors">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={field.required}
                                                                    onChange={(e) => updateField(field.id, { required: e.target.checked })}
                                                                    className="w-4 h-4"
                                                                />
                                                                <span className="font-semibold">Required</span>
                                                            </label>
                                                        </div>

                                                        {field.type === 'select' && (
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-600 mb-2">Options (one per line)</label>
                                                                <textarea
                                                                    value={field.options?.join('\n') || ''}
                                                                    onChange={(e) => updateField(field.id, { options: e.target.value.split('\n').filter(o => o.trim()) })}
                                                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-gold focus:outline-none"
                                                                    rows={3}
                                                                    placeholder="Option 1&#10;Option 2&#10;Option 3"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FormBuilder;
