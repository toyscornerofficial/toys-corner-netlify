import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { createInquiry, updateInquiry, STATUSES } from '../../services/inquiryService';
import { getISTDateString } from '../../utils/dateHelpers';

export default function InquiryForm({ inquiry, onSaved, onCancel }) {
  const isEdit = Boolean(inquiry);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: inquiry ?? {
      name: '',
      phone: '',
      required_product: '',
      description: '',
      status: 'Pending',
      date: getISTDateString(),
      followup_date: '',
      remarks: '',
    },
  });

  const onSubmit = async (values) => {
    const payload = { ...values, followup_date: values.followup_date || null };
    try {
      if (isEdit) {
        await updateInquiry(inquiry.id, payload);
        toast.success('Inquiry updated.');
      } else {
        await createInquiry(payload);
        toast.success('Inquiry recorded.');
      }
      onSaved();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to save inquiry.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label small fw-semibold">Customer Name</label>
          <input
            className={`form-control ${errors.name ? 'is-invalid' : ''}`}
            {...register('name', { required: 'Required' })}
          />
          {errors.name && <div className="invalid-feedback">{errors.name.message}</div>}
        </div>

        <div className="col-md-6">
          <label className="form-label small fw-semibold">Phone</label>
          <input
            className={`form-control ${errors.phone ? 'is-invalid' : ''}`}
            {...register('phone', { required: 'Required' })}
          />
          {errors.phone && <div className="invalid-feedback">{errors.phone.message}</div>}
        </div>

        <div className="col-12">
          <label className="form-label small fw-semibold">Required Product</label>
          <input
            className={`form-control ${errors.required_product ? 'is-invalid' : ''}`}
            placeholder="e.g. Hot Wheels Track Set"
            {...register('required_product', { required: 'Required' })}
          />
          {errors.required_product && <div className="invalid-feedback">{errors.required_product.message}</div>}
        </div>

        <div className="col-12">
          <label className="form-label small fw-semibold">Description</label>
          <textarea className="form-control" rows={2} {...register('description')} />
        </div>

        <div className="col-md-4">
          <label className="form-label small fw-semibold">Status</label>
          <select className="form-select" {...register('status')}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="col-md-4">
          <label className="form-label small fw-semibold">Date</label>
          <input type="date" className="form-control" {...register('date', { required: true })} />
        </div>

        <div className="col-md-4">
          <label className="form-label small fw-semibold">Follow-up Date</label>
          <input type="date" className="form-control" {...register('followup_date')} />
        </div>

        <div className="col-12">
          <label className="form-label small fw-semibold">Remarks</label>
          <textarea className="form-control" rows={2} {...register('remarks')} />
        </div>
      </div>

      <div className="d-flex justify-content-end gap-2 mt-4">
        <button type="button" className="btn btn-light" onClick={onCancel}>Cancel</button>
        <button
          type="submit"
          className="btn text-white fw-semibold"
          style={{ background: '#4F46E5' }}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Save'}
        </button>
      </div>
    </form>
  );
}
