import { Injectable } from "@angular/core";
import { SupabaseClient, createClient } from "@supabase/supabase-js";
import { environment } from "../../../environments/environment";
import { Photo } from "../models/photo.model";



@Injectable({providedIn: 'root'})
export class PhotoService {

  private supabase : SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey
  )

  //UploadService
  async Upload(file:File): Promise<Photo>{
    const formData = new FormData();
    formData.append('file',file);
    formData.append('upload_preset',environment.cloudinaryUploadPreset)

    const res =  await fetch(
      `https://api.cloudinary.com/v1_1/${environment.cloudinaryCloudName}/image/upload`,
      { method: 'POST', body: formData }
    );


    const cloudData= await res.json();

    const {data,error} = await this.supabase
    .from('fotos')
    .insert({cloudinary_url : cloudData.secure_url, public_id:cloudData.public_id})
    .select()
    .single();

    if(error) throw error;
    return data as Photo
  }

  async getAll(): Promise<Photo[]>{
    const {data,error} = await this.supabase
    .from('fotos')
    .select('*')
    .order('created_at', {ascending: false})
    if(error) throw error;
    return (data ?? []) as Photo[]
  }

}