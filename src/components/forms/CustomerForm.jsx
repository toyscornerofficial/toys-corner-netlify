import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { createCustomer, updateCustomer } from '../../services/customerService';

export default function CustomerForm({ customer, onSaved, onCancel }) {
  const isEdit = Boolean(customer);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: customer ?? { name: '', phone: '', email: '', address: '', birthday: '', notes: '' },
  });

  const onSubmit = async (values) => {
    try {
      const payload = { ...values, birthday: values.birthday || null };
      if (isEdit) {
        await updateCustomer(customer.id, payload);
        toast.success('Customer updated.');
      } else {
        const created = await createCustomer(payload);
        toast.success(`Customer added (${created.unique_customer_id}).`);
      }
      onSaved();
    } catch (err) {
      console.error(err);
      toast.error(err.message?.includes('duplicate') ? 'A customer with this phone already exists.' : err.message || 'Failed to save.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label small fw-semibold">Name</label>
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

        <div className="col-md-6">
          <label className="form-label small fw-semibold">Email</label>
          <input type="email" className="form-control" {...register('email')} />
        </div>

        <div className="col-md-6">
          <label className="form-label small fw-semibold">Birthday</label>
          <input type="date" className="form-control" {...register('birthday')} />
        </div>

        <div className="col-12">
          <label className="form-label small fw-semibold">Address</label>
          <input className="form-control" {...register('address')} />
        </div>

        <div className="col-12">
          <label className="form-label small fw-semibold">Notes</label>
          <textarea className="form-control" rows={2} {...register('notes')} />
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
