'use client'

import { useEffect, useState } from 'react'
import { supabase } from './utils/supabaseClient'


type User = {
  id: number
  name?: string
  [key: string]: any
}

export default function Home() {
  const [data, setData] = useState<User[] | null>(null)

useEffect(() => {
const fetchData = async () => {
  const { data, error } = await supabase.from('users').select('*');

  console.log('Supabase response:', data); // 👈 Add this line

  if (error) {
    console.error('Supabase error:', JSON.stringify(error, null, 2));
  } else {
    console.log('Supabase data:', data);
    setData(data);
  }
};

  fetchData();
}, []);


  return (
    <main>
      <h1>Data from Supabase</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </main>
  )
}
