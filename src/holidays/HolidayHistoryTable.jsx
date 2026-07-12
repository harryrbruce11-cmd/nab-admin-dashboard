import React, { useMemo, useState } from "react";

export default function HolidayHistoryTable({ requests }) {

    const [search,setSearch]=useState("");

    const filtered=useMemo(()=>{

        if(!search) return requests;

        return requests.filter(r=>{

            return(

                String(r.userName||"")
                .toLowerCase()
                .includes(search.toLowerCase())

                ||

                String(r.status||"")
                .toLowerCase()
                .includes(search.toLowerCase())

            );

        });

    },[requests,search]);

    return(

<div style={cardStyle}>

<div style={headerStyle}>

<div>

<p style={eyebrowStyle}>

History

</p>

<h2 style={titleStyle}>

Holiday Requests

</h2>

</div>

<input

placeholder="Search employee..."

value={search}

onChange={e=>setSearch(e.target.value)}

style={searchStyle}

/>

</div>

<table style={tableStyle}>

<thead>

<tr>

<th>Employee</th>

<th>Start</th>

<th>End</th>

<th>Days</th>

<th>Status</th>

<th>Reason</th>

</tr>

</thead>

<tbody>

{

filtered.map(request=>(

<tr
key={request.id}
>

<td>

{request.userName}

</td>

<td>

{new Date(request.startDate)
.toLocaleDateString("en-GB")}

</td>

<td>

{new Date(request.endDate)
.toLocaleDateString("en-GB")}

</td>

<td>

{request.workingDays}

</td>

<td>

<StatusBadge
status={request.status}
/>

</td>

<td>

{request.reason||"-"}

</td>

</tr>

))

}

</tbody>

</table>

</div>

);

}

function StatusBadge({status}){

let background="#fbbf24";
let colour="#78350f";

if(status==="Approved"){

background="#16a34a";
colour="white";

}

if(status==="Rejected"){

background="#dc2626";
colour="white";

}

return(

<div

style={{

display:"inline-flex",

padding:"6px 14px",

borderRadius:999,

background,

color:colour,

fontWeight:900,

fontSize:12

}}

>

{status}

</div>

);

}

const cardStyle={

background:"#fff",

borderRadius:20,

padding:20,

boxShadow:"0 14px 40px rgba(15,23,42,.06)"

};

const headerStyle={

display:"flex",

justifyContent:"space-between",

alignItems:"center",

marginBottom:20

};

const eyebrowStyle={

margin:0,

color:"#2563eb",

fontSize:12,

fontWeight:900,

textTransform:"uppercase"

};

const titleStyle={

margin:"4px 0 0",

fontSize:26,

fontWeight:900

};

const searchStyle={

width:260,

padding:12,

borderRadius:10,

border:"1px solid #ddd"

};

const tableStyle={

width:"100%",

borderCollapse:"collapse"

};

const cellStyle={

padding:14,

borderBottom:"1px solid #eee"

};

document.querySelectorAll?.("th").forEach(()=>{});