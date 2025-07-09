'use client';

import { useEffect, useState } from 'react';

export default function ProfilePage() {
  const [customer, setCustomer] = useState<any>(null);

  useEffect(() => {
    const wooCustomerId = localStorage.getItem('wooCustomerId');
    if (!wooCustomerId) return;

    fetch(`/api/profile?id=${wooCustomerId}`)
      .then(res => res.json())
      .then(setCustomer)
      .catch(console.error);
  }, []);

  if (!customer) {
    return <div className="p-4">No profile info found.</div>;
  }

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Your Profile</h1>
      <p><strong>Name:</strong> {customer.first_name} {customer.last_name}</p>
      <p><strong>Email:</strong> {customer.email}</p>
      <p><strong>Phone:</strong> {customer.billing?.phone}</p>
      <p><strong>Address:</strong> {customer.billing?.address_1}</p>
    </div>
  );
}
