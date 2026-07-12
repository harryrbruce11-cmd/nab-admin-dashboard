import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    getFirestore,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc
} from "firebase/firestore";

import { initializeApp } from "firebase/app";

const firebaseConfig = {

    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID

};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

class HolidayService{

    listen(callback){

        return onSnapshot(

            query(
                collection(db,"holidayRequests"),
                orderBy("createdAt","desc")
            ),

            snapshot=>{

                callback(

                    snapshot.docs.map(doc=>({

                        id:doc.id,
                        ...doc.data()

                    }))

                );

            }

        );

    }

    async create(request){

        return addDoc(

            collection(db,"holidayRequests"),

            {

                ...request,

                status:"Pending",

                createdAt:serverTimestamp(),

                approvedAt:null,

                approvedBy:"",

                comment:""

            }

        );

    }

    async approve(id,user){

        return updateDoc(

            doc(db,"holidayRequests",id),

            {

                status:"Approved",

                approvedBy:user,

                approvedAt:serverTimestamp()

            }

        );

    }

    async reject(id,user,comment){

        return updateDoc(

            doc(db,"holidayRequests",id),

            {

                status:"Rejected",

                approvedBy:user,

                approvedAt:serverTimestamp(),

                comment

            }

        );

    }

    async remove(id){

        return deleteDoc(

            doc(db,"holidayRequests",id)

        );

    }

    async employeeAlreadyBooked(

        uid,

        start,

        end

    ){

        const snapshot=

            await getDocs(

                collection(db,"holidayRequests")

            );

        return snapshot.docs.some(doc=>{

            const data=doc.data();

            if(data.uid!==uid) return false;

            if(data.status==="Rejected") return false;

            const requestStart=

                new Date(data.startDate);

            const requestEnd=

                new Date(data.endDate);

            return(

                start<=requestEnd&&

                end>=requestStart

            );

        });

    }

    calculateWorkingDays(

        start,

        end

    ){

        let total=0;

        let current=

            new Date(start);

        while(current<=end){

            const day=

                current.getDay();

            if(

                day!==0&&

                day!==6

            ){

                total++;

            }

            current.setDate(

                current.getDate()+1

            );

        }

        return total;

    }

}

export default new HolidayService();